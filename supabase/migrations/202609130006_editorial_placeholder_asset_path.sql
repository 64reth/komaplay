-- Normalize the alpha editorial no-image fallback to the real source-controlled
-- KOMA feature placeholder. The previous RPC default used a non-existent SVG
-- path (`/assets/koma-vhs-v2.svg`), which produced broken public strip images.

update public.features f
   set image = '/assets/koma-feature-placeholder.svg',
       image_alt = coalesce(nullif(f.image_alt,''),'KOMA://PLAY editorial placeholder'),
       updated_at = now()
 where f.image = '/assets/koma-vhs-v2.svg';

create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor public.profiles;
 v_existing public.features;
 v_result uuid;
 v_issue_id uuid;
 v_drop_id uuid;
 v_category_id uuid;
 v_format_id uuid;
 v_feature_id uuid := nullif(payload->>'feature_id','')::uuid;
 v_requested_status text := coalesce(nullif(payload->>'status',''),'draft');
 v_next_lifecycle text := case when v_requested_status in ('submitted','changes_requested','approved','published','taken_down') then v_requested_status else 'draft' end;
 v_snapshot_reason text := case when v_next_lifecycle='submitted' then 'Submitted for review' else 'Saved draft' end;
 v_image text := coalesce(nullif(payload->>'image',''),'/assets/koma-feature-placeholder.svg');
 v_image_alt text := coalesce(nullif(payload->>'image_alt',''),'KOMA://PLAY editorial placeholder');
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into v_actor from public.profiles p where p.id=auth.uid();
 if v_actor.id is null or v_actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if trim(coalesce(payload->>'title',''))='' or trim(coalesce(payload->>'slug',''))='' then raise exception 'Title and slug are required'; end if;
 select i.id into v_issue_id from public.issues i where i.status in ('current','finalising') order by i.opens_at desc limit 1;
 select wd.id into v_drop_id from public.weekly_drops wd where wd.issue_id=v_issue_id and wd.status='published' order by wd.display_order desc limit 1;
 select c.id into v_category_id from public.categories c where c.id=nullif(payload->>'category_id','')::uuid;
 if v_category_id is null then select c.id into v_category_id from public.categories c order by c.name limit 1; end if;
 select cf.id into v_format_id from public.content_formats cf where cf.slug='essay' limit 1;
 if v_feature_id is not null then
   select f.* into v_existing from public.features f where f.id=v_feature_id for update;
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
 return v_result;
end $$;

create or replace function public.publish_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
 feature public.features;
 next_position integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status<>'approved' then raise exception 'Only publish-ready panels can be published'; end if;
 select f.* into feature from public.features f where f.id=target for update;
 if feature.id is null then raise exception 'Feature not found'; end if;
 if exists(select 1 from public.features other where other.id<>target and other.slug=feature.slug and other.status='published' and other.lifecycle_status<>'draft') then
  raise exception 'A published feature already uses this slug';
 end if;
 if nullif(feature.title,'') is null or nullif(feature.slug,'') is null or nullif(feature.summary,'') is null then
  raise exception 'Title, slug and summary are required before publishing';
 end if;
 select coalesce(max(f.strip_position),0)+1 into next_position from public.features f where f.weekly_drop_id=feature.weekly_drop_id and f.status='published';
 update public.features f
    set status='published',
        lifecycle_status='open_panel',
        published_at=coalesce(f.published_at,now()),
        image=case when nullif(f.image,'') is null or f.image='/assets/koma-vhs-v2.svg' then '/assets/koma-feature-placeholder.svg' else f.image end,
        image_alt=coalesce(nullif(f.image_alt,''),'KOMA://PLAY editorial placeholder'),
        strip_position=case when f.strip_position is null or f.strip_position>=999 then next_position else f.strip_position end,
        updated_at=now()
  where f.id=target;
 update public.editorial_documents ed set lifecycle_status='published',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Published feature',auth.uid());
 return target;
end $$;
