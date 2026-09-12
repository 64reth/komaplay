-- Focused Phase 4A repair: make save/submit idempotent by an editor's draft slug and expose safe review inbox identity through a new additive RPC.
create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target uuid:=nullif(payload->>'feature_id','')::uuid; target_issue_id uuid; drop_id uuid; category_id uuid; format_id uuid; result uuid; doc jsonb; status text:=coalesce(payload->>'status','draft'); existing public.features;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if status not in ('draft','submitted') then raise exception 'Invalid draft status'; end if;
 if length(trim(payload->>'title'))<4 or length(trim(payload->>'slug'))<3 then raise exception 'Title and slug are required'; end if;
 if (payload->>'slug') !~ '^[a-z0-9-]{3,80}$' then raise exception 'Use a URL-safe slug'; end if;
 doc:=payload->'document';
 if doc is null or jsonb_typeof(doc)<>'object' then raise exception 'Structured document is required'; end if;
 target_issue_id:=nullif(payload->>'issue_id','')::uuid;
 drop_id:=nullif(payload->>'weekly_drop_id','')::uuid;
 category_id:=nullif(payload->>'category_id','')::uuid;
 format_id:=nullif(payload->>'format_id','')::uuid;
 if target_issue_id is null then select i.id into target_issue_id from public.issues i where i.status='current' order by i.opens_at desc limit 1; end if;
 if target_issue_id is null then select i.id into target_issue_id from public.issues i order by i.issue_number desc limit 1; end if;
 if drop_id is null then select wd.id into drop_id from public.weekly_drops wd where wd.issue_id=target_issue_id order by wd.display_order,wd.week_number limit 1; end if;
 if category_id is null then select c.id into category_id from public.categories c order by c.name limit 1; end if;
 if format_id is null then select cf.id into format_id from public.content_formats cf where cf.slug='essay' limit 1; end if;
 if target_issue_id is null or drop_id is null or category_id is null or format_id is null then raise exception 'Publication defaults are unavailable'; end if;
 if target is null then
  select f.id into target from public.features f join public.editorial_documents ed on ed.feature_id=f.id where f.slug=trim(payload->>'slug') and f.lifecycle_status='draft' and ed.author_id=auth.uid() limit 1;
 end if;
 if target is not null then
  select * into existing from public.features where id=target for update;
  if existing.id is null then raise exception 'Draft not found'; end if;
  if exists(select 1 from public.editorial_documents ed where ed.feature_id=target and ed.author_id<>auth.uid()) and actor.role<>'admin' then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
  if existing.lifecycle_status<>'draft' then raise exception 'Only draft features can be edited here'; end if;
  update public.features set slug=trim(payload->>'slug'),title=trim(payload->>'title'),summary=coalesce(payload->>'summary',''),editorial_body=coalesce(payload->>'body',''),category_id=category_id,format_id=format_id,image=coalesce(nullif(payload->>'image',''),image),image_alt=coalesce(payload->>'image_alt',''),updated_at=now() where id=target returning id into result;
 else
  insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,status,summary,editorial_body,image,image_alt,panel_size,panel_class)
  values(trim(payload->>'slug'),trim(payload->>'title'),target_issue_id,drop_id,999,category_id,format_id,'draft','draft',coalesce(payload->>'summary',''),coalesce(payload->>'body',''),coalesce(nullif(payload->>'image',''),'/assets/koma-vhs-v2.svg'),coalesce(payload->>'image_alt',''),'standard','') returning id into result;
  insert into public.revisions(feature_id,revision_number,summary) values(result,1,'Editorial draft created.');
 end if;
 insert into public.editorial_documents(feature_id,schema_version,working_document,author_id,lifecycle_status,updated_at)
 values(result,1,doc,auth.uid(),status,now())
 on conflict(feature_id) do update set working_document=excluded.working_document,lifecycle_status=excluded.lifecycle_status,updated_at=now(),revision_token=gen_random_uuid();
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(result,1,doc,case when status='submitted' then 'Submitted for review' else 'Saved draft' end,auth.uid());
 return result;
end $$;

create or replace function public.editorial_review_inbox() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist') as author_display_name
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),true) and ed.lifecycle_status in ('submitted','approved','changes_requested')
 order by ed.updated_at desc;
$$;

revoke all on function public.save_editorial_draft(jsonb),public.editorial_review_inbox() from public,anon,authenticated;
grant execute on function public.save_editorial_draft(jsonb),public.editorial_review_inbox() to authenticated;
