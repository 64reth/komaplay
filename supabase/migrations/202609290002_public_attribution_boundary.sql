-- A: additive compatibility preparation; original public interfaces remain until B.
-- Additive privacy boundary. Original provenance and storage objects are retained.
create table public.publication_media_refs (
 id uuid primary key default gen_random_uuid(), context_id uuid not null,
 context_kind text not null check(context_kind in ('feature','issue','addition')),
 bucket text not null, path text not null,
 unique(context_id,context_kind,bucket,path)
);

alter table public.publication_media_refs enable row level security;

revoke all on public.publication_media_refs from public,anon,authenticated;


-- One opaque reference per publication context, never per uploader.
create function public.register_publication_media(context uuid,kind text,document jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare asset text;
begin
 for asset in select m[1] from regexp_matches(replace(document::text,'%2F','/'),'(editorial/[0-9a-f-]{36}/[a-z0-9-]{3,80}/[0-9a-f-]{36}\.(?:png|jpg|webp)|cover-pool/[0-9a-f-]{36}/[0-9a-f-]{36}\.(?:png|jpg|webp)|[0-9a-f-]{36}/[0-9a-f-]{36}\.(?:png|jpg|webp))','g') m loop
  insert into public.publication_media_refs(context_id,context_kind,bucket,path)
  values(context,kind,case when asset like 'editorial/%' then 'editorial-feature-images' when asset like 'cover-pool/%' then 'issue-cover-pool' else 'open-panel-screenshots' end,asset) on conflict do nothing;
 end loop;
end $$;

create function public.capture_publication_media() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public.register_publication_media((case when tg_table_name='editorial_documents' then to_jsonb(new)->>'feature_id' else to_jsonb(new)->>'id' end)::uuid,case when tg_table_name='issues' then 'issue' when tg_table_name='published_additions' then 'addition' else 'feature' end,to_jsonb(new));
 return new;
end $$;

create trigger feature_publication_media after insert or update on public.features for each row execute function public.capture_publication_media();

create trigger document_publication_media after insert or update on public.editorial_documents for each row execute function public.capture_publication_media();

create trigger issue_publication_media after insert or update on public.issues for each row execute function public.capture_publication_media();

create trigger addition_publication_media after insert or update on public.published_additions for each row execute function public.capture_publication_media();

select public.register_publication_media(id,'feature',to_jsonb(f)) from public.features f;

select public.register_publication_media(feature_id,'feature',to_jsonb(d)) from public.editorial_documents d;

select public.register_publication_media(id,'issue',to_jsonb(i)) from public.issues i;

select public.register_publication_media(id,'addition',to_jsonb(a)) from public.published_additions a;


-- Helpers are private, so callers cannot turn a private path into a public existence oracle.
create function public.publication_text(value text,context uuid,kind text) returns text
language plpgsql stable security definer set search_path='' as $$
declare r public.publication_media_refs; output text:=coalesce(value,''); p text;
begin
 if not ((kind='feature' and public.feature_is_public(context)) or (kind='addition' and exists(select 1 from public.published_additions where id=context and public.feature_is_public(feature_id))) or (kind='issue' and exists(select 1 from public.issues where id=context and status='archived'))) then return '';end if;
 for r in select * from public.publication_media_refs where context_id=context and context_kind=kind order by length(path) desc loop
  foreach p in array array[r.path,replace(r.path,'/','%2F')] loop
   output:=regexp_replace(output,'https://[^[:space:]"<>]+/storage/v1/object/(sign|public|authenticated)/'||r.bucket||'/'||replace(p,'.','\.')||'(\?[^[:space:]"<>]*)?','/api/public-media/'||r.id,'g');
   output:=replace(output,'/api/editorial/image?path='||p,'/api/public-media/'||r.id);
   output:=replace(output,'/api/open-panel/image?path='||p,'/api/public-media/'||r.id);
   output:=replace(output,'/api/cover/image?path='||p,'/api/public-media/'||r.id);
   output:=replace(output,p,'/api/public-media/'||r.id);
  end loop;
 end loop;
 return output;
end $$;

create function public.publication_document(value jsonb,context uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; k text; v jsonb;
begin
 if jsonb_typeof(value)='string' then return to_jsonb(public.publication_text(value#>>'{}',context,'feature')); end if;
 if jsonb_typeof(value)='array' then select coalesce(jsonb_agg(public.publication_document(x,context)),'[]'::jsonb) into result from jsonb_array_elements(value) x;return result;end if;
 if jsonb_typeof(value)='object' then
  result:='{}';for k,v in select * from jsonb_each(value) loop
   if lower(regexp_replace(k,'[^a-zA-Z]','','g')) not in ('authorid','userid','profileid','accountid','createdby','updatedby','submittedby','reviewedby','contributorid','contributorids','moderatorid','publishingmoderator','email','owner','ownerid') then result:=result||jsonb_build_object(k,public.publication_document(v,context));end if;
  end loop;return result;
 end if;
 return value;
end $$;


-- Generate fixed view columns at migration time, omitting internal actor metadata.
do $$
declare columns text;
begin
 select string_agg(case when attname in ('image','editorial_body') then format('public.publication_text(f.%I,f.id,''feature'') as %I',attname,attname) else format('f.%I',attname) end,',' order by attnum) into columns from pg_attribute where attrelid='public.features'::regclass and attnum>0 and not attisdropped and attname not in ('author_id','created_by','updated_by','submitted_by','reviewed_by');
 execute 'create view public.public_features with (security_barrier=true) as select '||columns||' from public.features f where public.feature_is_public(f.id)';
 select string_agg(case when attname='cover_art' then 'public.publication_text(i.cover_art,i.id,''issue'') as cover_art' else format('i.%I',attname) end,',' order by attnum) into columns from pg_attribute where attrelid='public.issues'::regclass and attnum>0 and not attisdropped and attname not in ('created_by','cover_updated_by');
 execute 'create view public.public_issues with (security_barrier=true) as select '||columns||' from public.issues i where i.status<>''draft''';
end $$;


-- Snapshot each publication's chosen name; anonymous entries never get an identity token.
create table public.publication_credits (
 addition_id uuid primary key references public.published_additions(id),
 id uuid not null unique default gen_random_uuid(), display_name text not null,
 anonymous boolean not null
);

alter table public.publication_credits enable row level security;

revoke all on public.publication_credits from public,anon,authenticated;

create function public.capture_publication_credit() returns trigger
language plpgsql security definer set search_path='' as $$
declare choice text; label text;
begin
 select c.public_credit,case c.public_credit when 'Anonymous Panelist' then 'Anonymous Panelist' when 'Pen name' then coalesce(nullif(p.pen_name,''),'Panelist') else p.display_name end into choice,label from public.contributions c join public.profiles p on p.id=c.author_id where c.id=new.contribution_id;
 insert into public.publication_credits(addition_id,display_name,anonymous) values(new.id,coalesce(label,'Anonymous Panelist'),choice is null or choice='Anonymous Panelist') on conflict(addition_id) do nothing;
 return new;
end $$;

create trigger addition_publication_credit after insert on public.published_additions for each row execute function public.capture_publication_credit();

insert into public.publication_credits(addition_id,display_name,anonymous)
select a.id,case c.public_credit when 'Anonymous Panelist' then 'Anonymous Panelist' when 'Pen name' then coalesce(nullif(p.pen_name,''),'Panelist') else coalesce(nullif(pc.public_credit,''),p.display_name) end,c.public_credit='Anonymous Panelist'
from public.published_additions a join public.contributions c on c.id=a.contribution_id join public.profiles p on p.id=c.author_id left join public.panel_citations pc on pc.contribution_id=c.id;


create view public.public_additions with (security_barrier=true) as
select a.id,a.feature_id,public.publication_text(a.heading,a.id,'addition') as heading,public.publication_text(a.body,a.id,'addition') as body,a.target_section,a.display_order,a.revision_number,a.published_at,
 case when not credit.anonymous then credit.id end as credit_id,
 credit.display_name as public_credit,credit.anonymous,
 public.publication_text(a.screenshot_path,a.id,'addition') as screenshot_path,
 public.publication_text(a.source_url,a.id,'addition') as source_url,
 public.publication_text(a.media_url,a.id,'addition') as media_url
from public.published_additions a join public.publication_credits credit on credit.addition_id=a.id where public.feature_is_public(a.feature_id);

create view public.public_revisions with (security_barrier=true) as
select r.id,r.feature_id,r.revision_number,r.summary,r.created_at,
 array(select credit.id from public.published_additions a join public.publication_credits credit on credit.addition_id=a.id where a.feature_id=r.feature_id and a.revision_number=r.revision_number and not credit.anonymous) as credit_ids
from public.revisions r where public.feature_is_public(r.feature_id);

create or replace view public.public_credit_profiles with (security_barrier=true) as
select credit.id,credit.display_name,null::text as avatar_url from public.publication_credits credit join public.published_additions a on a.id=credit.addition_id where not credit.anonymous and public.feature_is_public(a.feature_id);

create view public.public_citations with (security_barrier=true) as
select pc.id,a.id as addition_id,pc.feature_id,credit.display_name as public_credit,pc.contribution_type,
 public.publication_text(pc.source_url,a.id,'addition') as source_url,
 pc.submitted_at,'KOMA://PLAY editor'::text as reviewing_editor,pc.published_at,pc.revision_number,pc.editorial_summary
from public.panel_citations pc join public.published_additions a on a.contribution_id=pc.contribution_id join public.publication_credits credit on credit.addition_id=a.id where public.feature_is_public(pc.feature_id);

grant select on public.public_features,public.public_issues,public.public_additions,public.public_revisions,public.public_credit_profiles,public.public_citations to anon,authenticated;

create or replace function public.public_attributed_document(feature_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.publication_document(ed.working_document,f.id) from public.editorial_documents ed join public.features f on f.id=ed.feature_id where f.slug=feature_slug and public.feature_is_public(f.id) and ed.lifecycle_status in ('published','archived') limit 1
$$;


-- Only a server credential may resolve an opaque reference into an original path.
-- The live publication check is mandatory even with a privileged storage client.
create function public.resolve_publication_media(reference uuid) returns table(bucket text,path text)
language sql stable security definer set search_path='' as $$
 select r.bucket,r.path from public.publication_media_refs r where r.id=reference and (
 -- A reference in arbitrary body/source text is not permission to publish a
 -- private object. Require a separately approved, public asset slot as well.
 (r.bucket='open-panel-screenshots' and exists(select 1 from public.published_additions a where a.screenshot_path=r.path and public.feature_is_public(a.feature_id)))
 or (r.bucket='issue-cover-pool' and public.cover_pool_image_public(r.path))
 or (r.bucket='editorial-feature-images' and (
  exists(select 1 from public.issues i where i.status='archived' and replace(i.cover_art,'%2F','/') in (r.path,'/api/editorial/image?path='||r.path))
  or exists(select 1 from public.features f join public.editorial_documents ed on ed.feature_id=f.id where public.feature_is_public(f.id) and ed.lifecycle_status in ('published','archived') and (
   replace(f.image,'%2F','/')='/api/editorial/image?path='||r.path
   or replace(ed.working_document->'header'->'hero'->>'src','%2F','/')='/api/editorial/image?path='||r.path
   or exists(select 1 from jsonb_array_elements(ed.working_document->'modules') m where
    (m->>'type'='image' and replace(m->'content'->>'src','%2F','/')='/api/editorial/image?path='||r.path)
    or (m->>'type'='gallery' and exists(select 1 from jsonb_array_elements(coalesce(m->'content'->'slides','[]')) slide where replace(slide->>'src','%2F','/')='/api/editorial/image?path='||r.path))
   )
  ))
 ))
 ) and (
  (r.context_kind='addition' and exists(select 1 from public.published_additions a where a.id=r.context_id and public.feature_is_public(a.feature_id) and position(r.path in replace(to_jsonb(a)::text,'%2F','/'))>0))
  or (r.context_kind='feature' and exists(select 1 from public.features f left join public.editorial_documents ed on ed.feature_id=f.id where f.id=r.context_id and public.feature_is_public(f.id) and (position(r.path in replace(f.image||f.editorial_body,'%2F','/'))>0 or (ed.lifecycle_status in ('published','archived') and position(r.path in replace(ed.working_document::text,'%2F','/'))>0))))
  or (r.context_kind='issue' and exists(select 1 from public.issues i where i.id=r.context_id and i.status='archived' and position(r.path in replace(i.cover_art,'%2F','/'))>0))
 )
$$;

revoke all on function public.register_publication_media(uuid,text,jsonb),public.capture_publication_media(),public.publication_text(text,uuid,text),public.publication_document(jsonb,uuid),public.capture_publication_credit(),public.resolve_publication_media(uuid) from public,anon,authenticated;

-- Server-only resolver grant; public projection wrappers follow below.
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.resolve_publication_media(uuid) to service_role;end if;end $$;


-- A view's helper EXECUTE checks use the invoker. Wrap each fixed projection
-- in a no-argument definer function instead of granting path-transform helpers.
-- This prevents callers testing guessed private paths against anonymous contexts.
do $$ declare name text; definition text;begin
 perform set_config('search_path','',true);
 foreach name in array array['public_features','public_issues','public_additions','public_revisions','public_credit_profiles','public_citations'] loop
  definition:=rtrim(pg_get_viewdef(('public.'||name)::regclass,true),';');
  execute format('create function public.read_%I() returns setof public.%I language sql stable security definer set search_path='''' as %L',name,name,definition);
  execute format('revoke all on function public.read_%I() from public,anon,authenticated',name);
  execute format('grant execute on function public.read_%I() to anon,authenticated',name);
  execute format('create or replace view public.%I with (security_barrier=true) as select * from public.read_%I()',name,name);
 end loop;
end $$;
revoke all on function public.public_attributed_document(text) from public,anon,authenticated;
grant execute on function public.public_attributed_document(text) to anon,authenticated;
