-- Alpha hardening: preserve content/history, permissive drafts and existing RPC signatures.
begin;

-- Make the already-shipped takedown transition reproducible from migrations.
alter table public.features drop constraint if exists features_lifecycle_status_check;
alter table public.features add constraint features_lifecycle_status_check check(lifecycle_status in ('draft','open_panel','closing_panel','final_panel','archived','taken_down'));
create or replace function public.feature_is_public(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.features f join public.issues i on i.id=f.issue_id join public.weekly_drops d on d.id=f.weekly_drop_id
 where f.id=target and f.status='published' and f.lifecycle_status in ('open_panel','closing_panel','final_panel','archived') and i.status<>'draft' and d.status='published' and f.published_at<=now() and d.published_at<=now())
$$;



-- Retry keys do not contain content and are private to the authenticated author.
create table public.editorial_draft_requests(actor_id uuid not null references public.profiles(id),request_key uuid not null,feature_id uuid not null references public.features(id),primary key(actor_id,request_key));
alter table public.editorial_draft_requests enable row level security;
revoke all on public.editorial_draft_requests from public,anon,authenticated;
create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor public.profiles;
 v_existing public.features;
 v_existing_doc public.editorial_documents;
 v_result uuid;
 v_issue_id uuid;
 v_drop_id uuid;
 v_category_id uuid;
 v_format_id uuid;
 v_feature_id uuid := nullif(payload->>'feature_id','')::uuid;
 v_request_key uuid := nullif(payload->>'request_key','')::uuid;
 v_requested_status text := coalesce(nullif(payload->>'status',''),'draft');
 v_next_lifecycle text := v_requested_status;
 v_snapshot_reason text := case when v_next_lifecycle='submitted' then 'Submitted for review' else 'Saved draft' end;
 v_image text := coalesce(nullif(payload->>'image',''),'/assets/koma-feature-placeholder.svg');
 v_image_alt text := coalesce(nullif(payload->>'image_alt',''),'KOMA://PLAY editorial placeholder');
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into v_actor from public.profiles p where p.id=auth.uid();
 if v_actor.id is null or v_actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if v_requested_status not in ('draft','changes_requested') then raise exception 'Use the authorised lifecycle action' using errcode='42501'; end if;
 if pg_column_size(payload)>1500000 or jsonb_typeof(payload->'document'->'modules') is distinct from 'array' then raise exception 'Unsupported document'; end if;
 if trim(coalesce(payload->>'title',''))='' or trim(coalesce(payload->>'slug',''))='' then raise exception 'Title and slug are required'; end if;
 select i.id into v_issue_id from public.issues i where i.status in ('current','finalising') order by i.opens_at desc limit 1;
 select wd.id into v_drop_id from public.weekly_drops wd where wd.issue_id=v_issue_id and wd.status='published' order by wd.display_order desc limit 1;
 select c.id into v_category_id from public.categories c where c.id=nullif(payload->>'category_id','')::uuid;
 if v_category_id is null then select c.id into v_category_id from public.categories c order by c.name limit 1; end if;
 select cf.id into v_format_id from public.content_formats cf where cf.slug='essay' limit 1;
 if v_feature_id is null and v_request_key is not null then
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||v_request_key::text,0));
   select r.feature_id into v_feature_id from public.editorial_draft_requests r where r.actor_id=auth.uid() and r.request_key=v_request_key;
 end if;
 if v_feature_id is not null then
   select ed.* into v_existing_doc from public.editorial_documents ed where ed.feature_id=v_feature_id for update;
   select f.* into v_existing from public.features f where f.id=v_feature_id for update;
   if v_existing.id is null or v_existing_doc.author_id is distinct from auth.uid() then raise exception 'Draft unavailable' using errcode='42501'; end if;
   if v_existing_doc.lifecycle_status not in ('draft','changes_requested') or v_existing.lifecycle_status<>'draft' then raise exception 'This panel has moved on' using errcode='P4090'; end if;
   if nullif(payload->>'expected_updated_at','') is not null and v_existing_doc.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'Newer version exists' using errcode='P4090'; end if;
 end if;
 if v_existing.id is not null then
   if not exists(select 1 from public.editorial_documents ed where ed.feature_id=v_existing.id and ed.author_id=auth.uid()) then raise exception 'You can only update your own editorial draft' using errcode='42501'; end if;
   update public.features f set title=trim(payload->>'title'),slug=trim(payload->>'slug'),summary=coalesce(payload->>'summary',''),editorial_body=coalesce(payload->>'body',''),category_id=v_category_id,format_id=v_format_id,image=v_image,image_alt=v_image_alt,updated_at=now() where f.id=v_existing.id returning f.id into v_result;
 else
   insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,status,lifecycle_status,summary,editorial_body,image,image_alt,panel_size,panel_class) values(trim(payload->>'slug'),trim(payload->>'title'),v_issue_id,v_drop_id,999,v_category_id,v_format_id,'draft','draft',coalesce(payload->>'summary',''),coalesce(payload->>'body',''),v_image,v_image_alt,'standard','') returning id into v_result;
 end if;
 insert into public.editorial_documents(feature_id,author_id,schema_version,working_document,lifecycle_status,submitted_at)
 values(v_result,auth.uid(),coalesce((payload->>'schema_version')::integer,1),coalesce(payload->'document','{}'::jsonb),v_next_lifecycle,case when v_next_lifecycle='submitted' then now() else null end)
 on conflict(feature_id) do update set schema_version=excluded.schema_version,working_document=excluded.working_document,lifecycle_status=v_next_lifecycle,submitted_at=case when v_next_lifecycle='submitted' then coalesce(public.editorial_documents.submitted_at,now()) else public.editorial_documents.submitted_at end,updated_at=now(),revision_token=gen_random_uuid();
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
 values(v_result,coalesce((payload->>'schema_version')::integer,1),coalesce(payload->'document','{}'::jsonb),v_snapshot_reason,auth.uid());
 if v_request_key is not null then insert into public.editorial_draft_requests values(auth.uid(),v_request_key,v_result) on conflict do nothing; end if;
 return v_result;
end $$;


-- Existing Workshop RPCs and role-based policies must honor account restrictions.
create or replace function public.open_panel_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and account_status='active'
$$;
create or replace function public.require_handbook_acceptance() returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(188504,1);
 if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then raise exception 'An active membership is required' using errcode='42501'; end if;
 if not public.has_current_handbook_acceptance() then raise exception 'Accept the current community handbook before participating' using errcode='42501'; end if;
end $$;


-- Storage policies cannot query a private table with an anonymous caller's grants.
-- Return only an access decision, never the private document itself.
create function public.editorial_image_readable(asset_name text) returns boolean language sql stable security definer set search_path='' as $$
 select asset_name ~ '^editorial/[0-9a-f-]{36}/[a-z0-9-]{3,80}/[0-9a-f-]{36}\.(png|jpg|webp)$'
 and exists(
  select 1 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
  where (
   f.image='/api/editorial/image?path='||asset_name
   or ed.working_document->'header'->'hero'->>'src'='/api/editorial/image?path='||asset_name
   or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(ed.working_document->'modules')='array' then ed.working_document->'modules' else '[]'::jsonb end) m
     where m->>'type'='image' and m->'content'->>'src'='/api/editorial/image?path='||asset_name)
  ) and (
   (ed.lifecycle_status in ('published','archived') and public.feature_is_public(f.id))
   or (ed.lifecycle_status in ('submitted','changes_requested','approved') and public.has_current_handbook_acceptance() and public.editorial_has_access(auth.uid(),false))
  )
 );
$$;
revoke all on function public.editorial_image_readable(text) from public,anon,authenticated;
grant execute on function public.editorial_image_readable(text) to anon,authenticated;
drop policy editorial_feature_image_published_read on storage.objects;
create policy editorial_feature_image_published_read on storage.objects for select to anon,authenticated using(bucket_id='editorial-feature-images' and public.editorial_image_readable(name));
-- Revoked or restricted editors must not keep private image access.
drop policy editorial_feature_image_owner_read on storage.objects;
create policy editorial_feature_image_owner_read on storage.objects for select to authenticated using(bucket_id='editorial-feature-images' and public.has_current_handbook_acceptance() and public.editorial_has_access(auth.uid(),false) and (storage.foldername(name))[1]='editorial' and (storage.foldername(name))[2]=auth.uid()::text);
-- Application administrators use the shared review RPC, not private draft reads.
drop policy editorial_documents_author_read on public.editorial_documents;
create policy editorial_documents_author_read on public.editorial_documents for select to authenticated using(author_id=auth.uid() and public.has_current_handbook_acceptance() and public.editorial_has_access(auth.uid(),false));

-- A closing Workshop is still a public article, including its ordered document.
create or replace function public.public_editorial_document(feature_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select ed.working_document from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where f.slug=feature_slug and public.feature_is_public(f.id) and ed.lifecycle_status in ('published','archived') limit 1;
$$;

-- One bounded counter per account/action. No IP address or fingerprint is stored.
create table public.abuse_action_limits (
 action text primary key, hourly_limit integer not null check(hourly_limit>0), daily_limit integer not null check(daily_limit>0)
);
insert into public.abuse_action_limits values ('editorial',120,500),('submission',20,50),('contribution',30,100),('profile',20,50),('upload',30,100),('report',15,40);
create table public.abuse_action_counts (
 actor_id uuid not null references public.profiles(id), action text not null references public.abuse_action_limits(action),
 hour_started timestamptz not null, hour_count integer not null, day_started timestamptz not null, day_count integer not null,
 primary key(actor_id,action)
);
alter table public.abuse_action_limits enable row level security;
alter table public.abuse_action_counts enable row level security;
revoke all on public.abuse_action_limits,public.abuse_action_counts from public,anon,authenticated;
create function public.guard_member_action() returns trigger language plpgsql security definer set search_path='' as $$
declare a text:=tg_argv[0]; limits public.abuse_action_limits; counts public.abuse_action_counts; moment timestamptz:=clock_timestamp();
begin
 -- Auth's profile-creation trigger and owner-operated migrations have no member JWT.
 if auth.uid() is null then return new; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then raise exception 'Active membership required' using errcode='42501'; end if;
 if tg_table_name='editorial_documents' then
 if new.lifecycle_status='submitted' then
   if tg_op='INSERT' then a:='submission';
   elsif old.lifecycle_status is distinct from new.lifecycle_status then a:='submission'; end if;
 end if;
 end if;
 select * into strict limits from public.abuse_action_limits where action=a;
 insert into public.abuse_action_counts values(auth.uid(),a,moment,0,moment,0) on conflict do nothing;
 select * into strict counts from public.abuse_action_counts where actor_id=auth.uid() and action=a for update;
 if counts.hour_started+interval '1 hour'<=moment then counts.hour_started:=moment; counts.hour_count:=0; end if;
 if counts.day_started+interval '1 day'<=moment then counts.day_started:=moment; counts.day_count:=0; end if;
 if counts.hour_count>=limits.hourly_limit or counts.day_count>=limits.daily_limit then raise exception 'Action temporarily paused' using errcode='P4290'; end if;
 update public.abuse_action_counts set hour_started=counts.hour_started,hour_count=counts.hour_count+1,day_started=counts.day_started,day_count=counts.day_count+1 where actor_id=auth.uid() and action=a;
 return new;
end $$;
revoke all on function public.guard_member_action() from public,anon,authenticated;
create trigger editorial_action_limit after insert or update on public.editorial_documents for each row execute function public.guard_member_action('editorial');
create trigger contribution_action_limit after insert or update on public.contributions for each row execute function public.guard_member_action('contribution');
create trigger profile_action_limit after update on public.profiles for each row execute function public.guard_member_action('profile');
create trigger report_action_limit after insert on public.correction_reports for each row execute function public.guard_member_action('report');
create trigger upload_action_limit after insert on storage.objects for each row when (new.bucket_id in ('editorial-feature-images','open-panel-screenshots')) execute function public.guard_member_action('upload');

-- Google supplies full_name/name; existing display names remain untouched on sign-in.
create or replace function public.create_open_panel_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'display_name'),80),''),nullif(left(trim(new.raw_user_meta_data->>'full_name'),80),''),nullif(left(trim(new.raw_user_meta_data->>'name'),80),''),'Reader')) on conflict(id) do nothing;
 return new;
end $$;
-- Profile settings previously had an UPDATE policy but no column grants.
-- Never grant changes to role, account_status, identity or creation time.
grant update(display_name,pen_name,bio,default_credit,profile_public,history_public,workbench_visible,interests,motion_preference,workshop_density,newsletter_opt_in,status_email_opt_in) on public.profiles to authenticated;
-- Public identity only for opted-in profiles or published credits, respecting credit choice.
create or replace view public.public_profiles with (security_barrier=true) as
select p.id,
 case when p.profile_public then p.display_name when p.default_credit='Anonymous Panelist' then 'Anonymous Panelist' when p.default_credit='Pen name' then coalesce(nullif(p.pen_name,''),'Panelist') else p.display_name end as display_name,
 case when p.profile_public then p.avatar_url else null end as avatar_url
from public.profiles p
where p.profile_public or exists(select 1 from public.published_additions a where a.contributor_id=p.id and public.feature_is_public(a.feature_id));

create table public.account_moderation_audit(id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),target_id uuid not null references public.profiles(id),previous_status text not null,new_status text not null,note text not null,created_at timestamptz not null default now());
alter table public.account_moderation_audit enable row level security;
revoke all on public.account_moderation_audit from public,anon,authenticated;
grant select on public.account_moderation_audit to authenticated;
create policy account_audit_review on public.account_moderation_audit for select to authenticated using(public.open_panel_role() in ('moderator','admin'));
create function public.moderate_member_account(target_email text,next_status text,review_note text) returns void language plpgsql security definer set search_path='' as $$
declare member public.profiles; actor_role text;
begin
 perform public.require_handbook_acceptance(); actor_role:=public.open_panel_role();
 if actor_role not in ('moderator','admin') or actor_role is null then raise exception 'Moderator access required' using errcode='42501'; end if;
 if next_status not in ('active','restricted','suspended') or length(trim(review_note)) not between 4 and 500 then raise exception 'Add a moderation reason'; end if;
 select p.* into member from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=lower(trim(target_email)) for update of p;
 if member.id is null or member.id=auth.uid() or member.role='admin' or (member.role='moderator' and actor_role<>'admin') then raise exception 'Account cannot be changed here' using errcode='42501'; end if;
 if member.account_status=next_status then return; end if;
 update public.profiles set account_status=next_status where id=member.id;
 insert into public.account_moderation_audit(actor_id,target_id,previous_status,new_status,note) values(auth.uid(),member.id,member.account_status,next_status,trim(review_note));
end $$;
revoke all on function public.moderate_member_account(text,text,text) from public,anon,authenticated;
grant execute on function public.moderate_member_account(text,text,text) to authenticated;

-- Keep a private asset inventory; never delete an abandoned upload automatically.
create function public.record_editorial_upload() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='editorial-feature-images' and auth.uid() is not null then
 insert into public.editorial_media_assets(uploader_id,storage_key,mime_type,bytes,status)
 values(auth.uid(),new.name,case when new.name like '%.png' then 'image/png' when new.name like '%.jpg' then 'image/jpeg' else 'image/webp' end,coalesce((to_jsonb(new)->'metadata'->>'size')::bigint,0),'staged') on conflict(storage_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.record_editorial_upload() from public,anon,authenticated;
create trigger editorial_upload_inventory after insert on storage.objects for each row execute function public.record_editorial_upload();
-- Validate at the database boundary too: callers can invoke RPCs without the UI.
create function public.validate_editorial_submission() returns trigger language plpgsql set search_path='' as $$
declare m jsonb; seen text[] := '{}'; idx integer := 0; kind text; value text;
begin
 if new.lifecycle_status<>'submitted' then return new; end if;
 if tg_op='UPDATE' then
  if old.lifecycle_status='submitted' and old.working_document=new.working_document then return new; end if;
 end if;
 if not exists(select 1 from public.features f where f.id=new.feature_id and length(trim(f.title)) between 4 and 150 and length(trim(f.summary)) between 8 and 1000 and f.slug ~ '^[a-z0-9-]{3,80}$') then raise exception 'Panel information incomplete'; end if;
 if jsonb_typeof(new.working_document->'modules') is distinct from 'array' then raise exception 'Article sections are required'; end if;
 if jsonb_array_length(new.working_document->'modules') not between 1 and 120 then raise exception 'Add between 1 and 120 article sections'; end if;
 for m in select * from jsonb_array_elements(new.working_document->'modules') loop
  idx := idx+1; kind := m->>'type';
  if coalesce(m->>'id','')='' or m->>'id'=any(seen) then raise exception 'Section IDs must be unique'; end if;
  seen := array_append(seen,m->>'id');
  if jsonb_typeof(m->'content') is distinct from 'object' then raise exception 'Section % needs content',idx; end if;
  if kind in ('paragraph','heading','subheading','pull-quote') and length(trim(coalesce(m->'content'->>'text','')))=0 then raise exception 'Section % is empty',idx; end if;
  if kind='image' and (length(trim(coalesce(m->'content'->>'src','')))=0 or length(trim(coalesce(m->'content'->>'alt','')))=0) then raise exception 'Image section % needs a source and alt text',idx; end if;
  if kind in ('ordered-list','unordered-list') then
   if jsonb_typeof(m->'content'->'items') is distinct from 'array' then raise exception 'List section % needs items',idx; end if;
   if not exists(select 1 from jsonb_array_elements_text(m->'content'->'items') item where length(trim(item))>0) then raise exception 'List section % is empty',idx; end if;
  end if;
  if kind in ('video','video-text') then
   value := trim(coalesce(m->'content'->>'url',''));
   if value !~ '^(https?://)?(www\.)?(youtube\.com/(watch\?v=|embed/)|youtu\.be/)[A-Za-z0-9_-]{6,}' and value !~ '^https://(www\.)?twitch\.tv/videos/[0-9]+(\?.*)?$' then raise exception 'Video section % needs a supported YouTube or Twitch URL',idx; end if;
  end if;
 end loop;
 return new;
end $$;
create trigger editorial_submission_validation before insert or update of working_document,lifecycle_status on public.editorial_documents for each row execute function public.validate_editorial_submission();
revoke all on function public.validate_editorial_submission() from public,anon,authenticated;


commit;
