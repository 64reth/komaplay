-- A successful canonical publish must be visible in the public catalogue; otherwise roll back the whole transition.
create or replace function public.publish_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; doc public.editorial_documents; feature public.features; next_position integer; parent public.issues; publication_drop public.weekly_drops;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status not in ('approved','published') then raise exception 'Only publish-ready panels can be published'; end if;
 if doc.reviewed_by is null or doc.reviewed_by=doc.author_id or doc.reviewed_by=coalesce(doc.submitted_by,doc.author_id) then raise exception 'Independent approval is required before publication' using errcode='42501'; end if;
 select f.* into feature from public.features f where f.id=target for update;
 if feature.id is null then raise exception 'Feature not found'; end if;
 if exists(select 1 from public.features other where other.id<>target and other.slug=feature.slug and other.status='published' and other.lifecycle_status<>'draft') then raise exception 'A published feature already uses this slug'; end if;
 if nullif(feature.title,'') is null or nullif(feature.slug,'') is null or nullif(feature.summary,'') is null then raise exception 'Title, slug and summary are required before publishing'; end if;
 -- Lock the Issue before resolving its publication scaffolding; concurrent publishes reuse the same drop.
 select * into parent from public.issues where id=coalesce(feature.issue_id,(select id from public.issues where status='current')) for update;
 if parent.id is null or parent.status not in ('current','finalising') then raise exception 'Choose an open Issue before publishing this Panel';end if;
 if doc.lifecycle_status='published' and (feature.status<>'published' or feature.lifecycle_status not in ('open_panel','closing_panel','final_panel')) then raise exception 'This Panel is not eligible for publication retry';end if;
 select * into publication_drop from public.weekly_drops where id=feature.weekly_drop_id and issue_id=parent.id for update;
 if publication_drop.id is null then
  select * into publication_drop from public.weekly_drops where issue_id=parent.id and status in ('published','draft') order by (status='published') desc,display_order desc,id limit 1 for update;
 end if;
 if publication_drop.id is null then
  insert into public.weekly_drops(issue_id,week_number,label,status,display_order)
   select parent.id,n,'Week '||n,'draft',n from generate_series(1,4) n
   where not exists(select 1 from public.weekly_drops where issue_id=parent.id and week_number=n) order by n limit 1 returning * into publication_drop;
 end if;
 if publication_drop.id is null then raise exception 'No weekly publication slot is available';end if;
 if publication_drop.status='scheduled' and publication_drop.scheduled_at>now() then raise exception 'This Panel belongs to a future scheduled drop';end if;
 update public.weekly_drops set status='published',published_at=least(coalesce(published_at,now()),now()),updated_at=now()
  where id=publication_drop.id and (status<>'published' or published_at>now());
 if feature.issue_id is distinct from parent.id or feature.weekly_drop_id is distinct from publication_drop.id then
  update public.features set issue_id=parent.id,weekly_drop_id=publication_drop.id where id=target;
 end if;
 feature.weekly_drop_id:=publication_drop.id;
 -- A retry repairs downstream visibility without rewriting publication history or duplicating snapshots.
 if doc.lifecycle_status='published' then
  if not public.feature_is_public(target) then raise exception 'Publication could not establish public catalogue visibility';end if;
  return target;
 end if;
 select coalesce(max(f.strip_position),0)+1 into next_position from public.features f where f.weekly_drop_id=feature.weekly_drop_id and f.status='published';
 update public.features f set status='published',lifecycle_status='open_panel',published_at=coalesce(f.published_at,now()),image=case when nullif(f.image,'') is null or f.image='/assets/koma-vhs-v2.svg' then '/assets/koma-feature-placeholder.svg' else f.image end,image_alt=case when nullif(f.image,'') is null or f.image in ('/assets/koma-vhs-v2.svg','/assets/koma-feature-placeholder.svg') then 'KOMA://PLAY editorial placeholder' else coalesce(nullif(f.image_alt,''),'KOMA://PLAY editorial placeholder') end,strip_position=case when f.strip_position is null or f.strip_position>=999 then next_position else f.strip_position end,updated_at=now() where f.id=target;
 update public.editorial_documents ed set lifecycle_status='published',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Published feature',auth.uid());
 if not public.feature_is_public(target) then raise exception 'Publication could not establish public catalogue visibility';end if;
 return target;
end $$;
