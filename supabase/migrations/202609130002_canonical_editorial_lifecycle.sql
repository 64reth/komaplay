-- Phase 4A lifecycle refactor: expose one canonical editorial lifecycle through RPCs.
-- Storage keeps legacy 'approved' temporarily because the existing table check constraint predates 'publish_ready'.
-- The compatibility adapter returns 'publish_ready' to the application and keeps public publishing separate.

create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target uuid:=nullif(payload->>'feature_id','')::uuid; target_issue_id uuid; drop_id uuid; category_id uuid; format_id uuid; result uuid; doc jsonb; status text:=coalesce(payload->>'status','draft'); storage_status text; existing public.features; existing_doc public.editorial_documents;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if status not in ('draft','submitted','changes_requested') then raise exception 'Invalid draft status'; end if;
 storage_status:=status;
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
  select * into existing_doc from public.editorial_documents where feature_id=target for update;
  if existing.id is null or existing_doc.feature_id is null then raise exception 'Draft not found'; end if;
  if existing_doc.author_id<>auth.uid() and actor.role<>'admin' then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
  if existing_doc.lifecycle_status in ('submitted','approved','published','archived','scheduled') and storage_status<>'submitted' then raise exception 'This panel is not editable in its current status'; end if;
  if existing.lifecycle_status<>'draft' then raise exception 'Only unpublished editorial features can be edited here'; end if;
  update public.features set slug=trim(payload->>'slug'),title=trim(payload->>'title'),summary=coalesce(payload->>'summary',''),editorial_body=coalesce(payload->>'body',''),category_id=category_id,format_id=format_id,image=coalesce(nullif(payload->>'image',''),image),image_alt=coalesce(payload->>'image_alt',''),updated_at=now() where id=target returning id into result;
 else
  if storage_status='changes_requested' then storage_status:='draft'; end if;
  insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,status,summary,editorial_body,image,image_alt,panel_size,panel_class)
  values(trim(payload->>'slug'),trim(payload->>'title'),target_issue_id,drop_id,999,category_id,format_id,'draft','draft',coalesce(payload->>'summary',''),coalesce(payload->>'body',''),coalesce(nullif(payload->>'image',''),'/assets/koma-vhs-v2.svg'),coalesce(payload->>'image_alt',''),'standard','') returning id into result;
  insert into public.revisions(feature_id,revision_number,summary) values(result,1,'Editorial draft created.');
 end if;
 insert into public.editorial_documents(feature_id,schema_version,working_document,author_id,lifecycle_status,updated_at)
 values(result,1,doc,auth.uid(),storage_status,now())
 on conflict(feature_id) do update set working_document=excluded.working_document,lifecycle_status=excluded.lifecycle_status,updated_at=now(),revision_token=gen_random_uuid();
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(result,1,doc,case when storage_status='submitted' then 'Submitted for review' when storage_status='changes_requested' then 'Saved revision after changes requested' else 'Saved draft' end,auth.uid());
 return result;
end $$;

create or replace function public.submit_editorial_draft(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
 can_review boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 can_review := public.editorial_has_access(auth.uid(),true);
 select * into doc from public.editorial_documents where feature_id=target for update;
 if doc.feature_id is null then raise exception 'Draft not found'; end if;
 if doc.author_id<>auth.uid() and not can_review then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
 if doc.lifecycle_status='submitted' then return target; end if;
 if doc.lifecycle_status not in ('draft','changes_requested') then raise exception 'Only draft or changes-requested panels can be submitted for review'; end if;
 update public.editorial_documents set lifecycle_status='submitted',updated_at=now(),revision_token=gen_random_uuid() where feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Submitted for review',auth.uid());
 return target;
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
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,case when next_status='approved' then 'Marked publish-ready' else 'Changes requested: '||left(coalesce(review_note,''),220) end,auth.uid());
 return target;
end $$;

create or replace function public.editorial_my_work() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,category_id uuid,image text,image_alt text,reviewer_note text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end as lifecycle_status,ed.updated_at,ed.working_document,f.category_id,f.image,f.image_alt,
 case when ed.lifecycle_status='changes_requested' then nullif(regexp_replace(coalesce((select s.reason from public.editorial_document_snapshots s where s.feature_id=ed.feature_id and s.reason like 'Changes requested:%' order by s.created_at desc limit 1),''),'^Changes requested:\s*','','i'),'') else null end as reviewer_note
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where ed.author_id=auth.uid() and public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('draft','submitted','changes_requested','approved')
 order by ed.updated_at desc;
$$;

create or replace function public.editorial_review_inbox() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end as lifecycle_status,ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist') as author_display_name
 from public.editorial_documents ed
 join public.features f on f.id=ed.feature_id
 left join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('submitted','changes_requested','approved')
 order by ed.updated_at desc;
$$;

create or replace function public.editorial_submitted_drafts() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end as lifecycle_status,ed.updated_at,ed.working_document
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('submitted','changes_requested','approved')
 order by ed.updated_at desc;
$$;

revoke all on function public.save_editorial_draft(jsonb),public.submit_editorial_draft(uuid),public.editorial_review_draft(uuid,text,text),public.editorial_my_work(),public.editorial_review_inbox(),public.editorial_submitted_drafts() from public,anon,authenticated;
grant execute on function public.save_editorial_draft(jsonb),public.submit_editorial_draft(uuid),public.editorial_review_draft(uuid,text,text),public.editorial_my_work(),public.editorial_review_inbox(),public.editorial_submitted_drafts() to authenticated;
