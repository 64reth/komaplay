-- Keep the proven archive transaction; extend its canonical entry point with successor recovery.
alter function public.close_issue_internal(uuid) rename to close_issue_archive_internal;
create function public.ensure_next_issue_internal(previous uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.issues; next_issue public.issues; next_month date; other_current uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('koma-monthly-continuity',0));
 select * into prior from public.issues where id=previous for update;
 if prior.id is null or prior.status<>'archived' then raise exception 'Archive the previous Issue before opening its successor';end if;
 next_month:=(make_date(prior.year,prior.month,1)+interval '1 month')::date;
 select * into next_issue from public.issues where year=extract(year from next_month)::integer and month=extract(month from next_month)::integer for update;
 if next_issue.id is not null and next_issue.status in ('current','finalising','archived') then
  if next_issue.status<>'archived' and not exists(select 1 from public.weekly_drops where issue_id=next_issue.id) then insert into public.weekly_drops(issue_id,week_number,label,status,display_order) values(next_issue.id,1,'Week 1','draft',1) on conflict(issue_id,week_number) do nothing;end if;
  return jsonb_build_object('id',next_issue.id,'number',next_issue.issue_number,'year',next_issue.year,'month',next_issue.month,'status',next_issue.status,'reused',true);
 end if;
 select id into other_current from public.issues where status='current';
 if other_current is not null then raise exception 'Another current Issue exists; resolve its chronology before activating the successor';end if;
 if next_issue.id is null then
  if exists(select 1 from public.issues where issue_number=prior.issue_number+1) then raise exception 'The next Issue number belongs to another month; resolve its chronology';end if;
  insert into public.issues(issue_number,slug,title,cover_label,year,month,status,opens_at,closes_at)
   values(prior.issue_number+1,'issue-'||lower(to_char(next_month,'FMMonth'))||'-'||extract(year from next_month)::text,to_char(next_month,'FMMonth YYYY'),
    'KOMA://PLAY / '||lpad((prior.issue_number+1)::text,3,'0'),extract(year from next_month)::integer,extract(month from next_month)::integer,'current',
    next_month::timestamp at time zone 'UTC',(next_month+interval '1 month') at time zone 'UTC') returning * into next_issue;
 else
  -- Reuse editorially prepared metadata, dates, content and numbering without overwriting it.
  update public.issues set status='current',updated_at=now() where id=next_issue.id returning * into next_issue;
 end if;
 -- An unpublished weekly container is required by the existing first-draft writer. No Panel or published drop is invented.
 if not exists(select 1 from public.weekly_drops where issue_id=next_issue.id) then insert into public.weekly_drops(issue_id,week_number,label,status,display_order) values(next_issue.id,1,'Week 1','draft',1) on conflict(issue_id,week_number) do nothing;end if;
 return jsonb_build_object('id',next_issue.id,'number',next_issue.issue_number,'year',next_issue.year,'month',next_issue.month,'status',next_issue.status);
end $$;
create function public.close_issue_internal(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; successor jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('koma-monthly-continuity',0)) then
  return jsonb_build_object('status','CLOSE_IN_PROGRESS','lifecycle_state','CLOSING','issueId',target,'reason','Monthly Issue reconciliation is already in progress. Retry shortly.');
 end if;
 result:=public.close_issue_archive_internal(target);
 if result->>'status' not in ('ARCHIVED','ALREADY_ARCHIVED') then return result;end if;
 begin
  successor:=public.ensure_next_issue_internal(target);
  update public.issue_rollover set phase='archived',message='Archived; next monthly Issue is available.',checked_at=now() where issue_id=target and phase='error';
  return result||jsonb_build_object('nextIssue',successor);
 exception when others then
  insert into public.issue_rollover(issue_id,phase,message) values(target,'error','Archive secured; next-Issue activation failed. Retry reconciliation and check conflicting current Issues or Issue numbers. SQLSTATE '||sqlstate) on conflict(issue_id) do update set phase='error',message=excluded.message,checked_at=now();
  -- Archive is already secured. No partial successor survives; retry the same canonical operation.
  return result||jsonb_build_object('status','FAILED','step','activate-next-issue','reason','The Issue is archived, but its next monthly container could not be activated. Retry reconciliation; check for a conflicting current Issue or Issue number.','code',sqlstate);
 end;
end $$;
create or replace function public.run_issue_rollover() returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; results jsonb:='[]'; state jsonb;
begin
 for i in select * from public.issues where status in ('current','finalising') and ((make_date(year,month,1)+interval '1 month') at time zone 'UTC')<=now() order by year,month,id loop
  state:=public.close_issue_internal(i.id);results:=results||jsonb_build_array(state||jsonb_build_object('issue',i.issue_number));
 end loop;
 -- Repair the latest archived transition even if the process stopped before opening its successor.
 select * into i from public.issues where status='archived' order by year desc,month desc,id limit 1;
 if i.id is not null then
  state:=public.close_issue_internal(i.id);results:=results||jsonb_build_array(state||jsonb_build_object('issue',i.issue_number));
 end if;
 update public.weekly_drops d set status='published',published_at=d.scheduled_at,updated_at=now() from public.issues parent
 where parent.id=d.issue_id and parent.status='current' and now()>=parent.opens_at and now()<parent.closes_at and d.status='scheduled' and d.scheduled_at<=now() and d.scheduled_at>=parent.opens_at and d.scheduled_at<parent.closes_at;
 return results;
end $$;
revoke all on function public.close_issue_archive_internal(uuid),public.ensure_next_issue_internal(uuid),public.close_issue_internal(uuid) from public,anon,authenticated;

create or replace function public.issue_close_state(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; failure text;
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('koma-close-issue:'||target::text,0)) then return jsonb_build_object('issueId',target,'status','CLOSE_IN_PROGRESS','lifecycle_state','CLOSING','reason','Issue closure is already in progress.');end if;
 result:=public.issue_close_state_internal(target);
 select message into failure from public.issue_rollover where issue_id=target and phase='error';
 if result->>'status'='ALREADY_ARCHIVED' and failure is not null then return result||jsonb_build_object('status','FAILED','lifecycle_state','CLOSE FAILED','reason',failure);end if;
 return result;
end $$;

-- Draft creation must also work before the first weekly drop is published.
-- Retain the existing save, consent, ownership and revision rules unchanged.
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
 select wd.id into v_drop_id from public.weekly_drops wd where wd.issue_id=v_issue_id order by (wd.status='published') desc,wd.display_order desc,wd.id limit 1;
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
