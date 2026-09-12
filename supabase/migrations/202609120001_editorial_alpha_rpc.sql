-- Minimal Editorial/Admin alpha RPCs. Reuses existing editorial tables and keeps table writes behind server-checked functions.
create or replace function public.editorial_has_access(target uuid default auth.uid(), review boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=target and p.account_status='active' and p.role in ('admin','moderator'))
 or exists(select 1 from public.editorial_access_grants g join public.profiles p on p.id=g.user_id where g.user_id=target and p.account_status='active' and g.revoked_at is null and (not review or g.access_level='administrator'));
$$;

create or replace function public.manage_editorial_grant(target_email text, grant_access boolean, grant_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target_user auth.users; target_profile public.profiles; result uuid; previous uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into actor from public.profiles where id=auth.uid();
 if actor.role<>'admin' or actor.account_status<>'active' then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into target_user from auth.users where lower(email)=lower(trim(target_email)) limit 1;
 if target_user.id is null then raise exception 'No existing user found for that email'; end if;
 insert into public.profiles(id,display_name) values(target_user.id,coalesce(nullif(left(target_user.raw_user_meta_data->>'display_name',80),''),'Reader')) on conflict(id) do nothing;
 select * into target_profile from public.profiles where id=target_user.id for update;
 if target_profile.account_status<>'active' then raise exception 'Cannot grant editorial access to a restricted account'; end if;
 if grant_access then
  select id into result from public.editorial_access_grants where user_id=target_profile.id and access_level='editor' and scope_type='global' and revoked_at is null limit 1;
  if result is null then
   insert into public.editorial_access_grants(user_id,access_level,scope_type,granted_by,reason) values(target_profile.id,'editor','global',auth.uid(),nullif(trim(grant_reason),'')) returning id into result;
  end if;
 else
  if target_profile.id=auth.uid() and actor.role='admin' then raise exception 'Your administrator role is managed separately and cannot be removed here'; end if;
  select id into previous from public.editorial_access_grants where user_id=target_profile.id and access_level='editor' and scope_type='global' and revoked_at is null limit 1;
  update public.editorial_access_grants set revoked_by=auth.uid(),revoked_at=now(),updated_at=now(),reason=coalesce(nullif(trim(grant_reason),''),reason) where id=previous returning id into result;
 end if;
 return coalesce(result,target_profile.id);
end $$;

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
 if target_issue_id is null then select id into target_issue_id from public.issues where status='current' order by opens_at desc limit 1; end if;
 if target_issue_id is null then select id into target_issue_id from public.issues order by issue_number desc limit 1; end if;
 if drop_id is null then select wd.id into drop_id from public.weekly_drops wd where wd.issue_id=target_issue_id order by wd.display_order,wd.week_number limit 1; end if;
 if category_id is null then select id into category_id from public.categories order by name limit 1; end if;
 if format_id is null then select id into format_id from public.content_formats where slug='essay' limit 1; end if;
 if target_issue_id is null or drop_id is null or category_id is null or format_id is null then raise exception 'Publication defaults are unavailable'; end if;
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

create or replace function public.editorial_review_draft(target uuid, decision text, review_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; doc public.editorial_documents; next_status text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Review access required' using errcode='42501'; end if;
 if decision='approve' then next_status:='approved'; elsif decision='changes' then next_status:='changes_requested'; else raise exception 'Invalid review decision'; end if;
 select * into doc from public.editorial_documents where feature_id=target for update;
 if doc.feature_id is null or doc.lifecycle_status not in ('submitted','changes_requested','approved') then raise exception 'Submitted draft not found'; end if;
 update public.editorial_documents set lifecycle_status=next_status,updated_at=now(),revision_token=gen_random_uuid() where feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,case when next_status='approved' then 'Approved as publish-ready' else 'Changes requested: '||left(coalesce(review_note,''),220) end,auth.uid());
 return target;
end $$;

create or replace function public.editorial_submitted_drafts() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where public.editorial_has_access(auth.uid(),true) and ed.lifecycle_status in ('submitted','approved','changes_requested')
 order by ed.updated_at desc;
$$;

revoke all on function public.editorial_has_access(uuid,boolean),public.manage_editorial_grant(text,boolean,text),public.save_editorial_draft(jsonb),public.editorial_review_draft(uuid,text,text),public.editorial_submitted_drafts() from public,anon,authenticated;
grant execute on function public.editorial_has_access(uuid,boolean),public.manage_editorial_grant(text,boolean,text),public.save_editorial_draft(jsonb),public.editorial_review_draft(uuid,text,text),public.editorial_submitted_drafts() to authenticated;
