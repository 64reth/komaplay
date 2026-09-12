-- Focused Phase 4A lifecycle repair: expose an editor's own panel work with enough data to reopen drafts and review notes.
create or replace function public.editorial_my_work() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,category_id uuid,image text,image_alt text,reviewer_note text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document,f.category_id,f.image,f.image_alt,
 case when ed.lifecycle_status='changes_requested' then nullif(regexp_replace(coalesce((select s.reason from public.editorial_document_snapshots s where s.feature_id=ed.feature_id and s.reason like 'Changes requested:%' order by s.created_at desc limit 1),''),'^Changes requested:\s*','','i'),'') else null end as reviewer_note
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where ed.author_id=auth.uid() and public.editorial_has_access(auth.uid(),false)
 order by ed.updated_at desc;
$$;

create or replace function public.editorial_review_inbox() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist') as author_display_name
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),true) and ed.lifecycle_status in ('submitted','approved','changes_requested')
 order by ed.updated_at desc;
$$;

revoke all on function public.editorial_my_work(),public.editorial_review_inbox() from public,anon,authenticated;
grant execute on function public.editorial_my_work(),public.editorial_review_inbox() to authenticated;
