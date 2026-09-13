-- Phase 4C archive controls alpha.
-- Adds a reversible published -> archived transition and preserves public archive reads.

create or replace function public.archive_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
 feature public.features;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status<>'published' then raise exception 'Only published panels can be archived'; end if;
 select f.* into feature from public.features f where f.id=target for update;
 if feature.id is null or feature.status<>'published' then raise exception 'Only public panels can be archived'; end if;
 update public.features f set lifecycle_status='archived',archived_at=coalesce(f.archived_at,now()),updated_at=now() where f.id=target;
 update public.editorial_documents ed set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Archived public panel',auth.uid());
 return target;
end $$;

create or replace function public.take_down_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status not in ('published','archived') then raise exception 'Only published or archived panels can be taken down'; end if;
 update public.features f set status='archived',lifecycle_status='taken_down',archived_at=coalesce(f.archived_at,now()),updated_at=now() where f.id=target;
 update public.editorial_documents ed set lifecycle_status='taken_down',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Taken down from public publication',auth.uid());
 return target;
end $$;

create or replace function public.editorial_publication_panels() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text,published_at timestamptz) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,
        case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end as lifecycle_status,
        ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist') as author_display_name,f.published_at
 from public.editorial_documents ed
 join public.features f on f.id=ed.feature_id
 left join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('approved','published','archived','taken_down')
 order by ed.updated_at desc;
$$;

create or replace function public.public_editorial_document(feature_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select ed.working_document
 from public.editorial_documents ed
 join public.features f on f.id=ed.feature_id
 join public.weekly_drops wd on wd.id=f.weekly_drop_id
 join public.issues i on i.id=f.issue_id
 where f.slug=feature_slug
   and f.status='published'
   and f.lifecycle_status in ('open_panel','final_panel','archived')
   and f.published_at<=now()
   and wd.status='published'
   and wd.published_at<=now()
   and i.status<>'draft'
   and ed.lifecycle_status in ('published','archived')
 limit 1;
$$;

revoke all on function public.archive_editorial_panel(uuid),public.take_down_editorial_panel(uuid),public.editorial_publication_panels(),public.public_editorial_document(text) from public,anon,authenticated;
grant execute on function public.archive_editorial_panel(uuid),public.take_down_editorial_panel(uuid),public.editorial_publication_panels() to authenticated;
grant execute on function public.public_editorial_document(text) to anon,authenticated;
