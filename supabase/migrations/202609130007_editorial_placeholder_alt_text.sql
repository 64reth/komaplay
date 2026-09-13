-- Ensure alpha editorial placeholder images use the canonical public alt text.
-- Real feature images keep their authored alt text.

update public.features f
   set image_alt = 'KOMA://PLAY editorial placeholder',
       updated_at = now()
 where f.image = '/assets/koma-feature-placeholder.svg'
   and f.image_alt <> 'KOMA://PLAY editorial placeholder';

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
        image_alt=case when nullif(f.image,'') is null or f.image in ('/assets/koma-vhs-v2.svg','/assets/koma-feature-placeholder.svg') then 'KOMA://PLAY editorial placeholder' else coalesce(nullif(f.image_alt,''),'KOMA://PLAY editorial placeholder') end,
        strip_position=case when f.strip_position is null or f.strip_position>=999 then next_position else f.strip_position end,
        updated_at=now()
  where f.id=target;
 update public.editorial_documents ed set lifecycle_status='published',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Published feature',auth.uid());
 return target;
end $$;
