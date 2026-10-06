-- Classifications only: no content, templates, lifecycle or permission changes.
insert into public.content_formats(name,slug) values
 ('Essay','essay'),('Review','review'),('Feature','feature'),('Editorial','editorial'),('News','news'),('Interview','interview')
on conflict(slug) do nothing;

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
 if nullif(payload->>'format','') is not null and payload->>'format' not in ('essay','review','feature','editorial','news','interview') then raise exception 'Choose an available content format';end if;
 select cf.id into v_format_id from public.content_formats cf where cf.slug=coalesce(nullif(payload->>'format',''),(select existing_format.slug from public.features existing_feature join public.content_formats existing_format on existing_format.id=existing_feature.format_id where existing_feature.id=v_feature_id),'essay');
 if v_format_id is null then raise exception 'Content format is unavailable';end if;
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

-- Reopening uses the canonical classification, including older records without composer metadata.
create or replace function public.editorial_my_work() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,category_id uuid,image text,image_alt text,reviewer_note text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end as lifecycle_status,ed.updated_at,ed.working_document||jsonb_build_object('composer',coalesce(ed.working_document->'composer','{}'::jsonb)||jsonb_build_object('format',coalesce(cf.slug,'essay'))),f.category_id,f.image,f.image_alt,
 case when ed.lifecycle_status='changes_requested' then nullif(regexp_replace(coalesce((select s.reason from public.editorial_document_snapshots s where s.feature_id=ed.feature_id and s.reason like 'Changes requested:%' order by s.created_at desc limit 1),''),'^Changes requested:\s*','','i'),'') else null end as reviewer_note
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id left join public.content_formats cf on cf.id=f.format_id
 where ed.author_id=auth.uid() and public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('draft','submitted','changes_requested','approved')
 order by ed.updated_at desc;
$$;
