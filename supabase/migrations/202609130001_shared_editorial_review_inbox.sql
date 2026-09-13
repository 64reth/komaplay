-- Phase 4A repair: the Review Inbox is a shared editorial pool for active editors and higher.
create or replace function public.editorial_review_inbox() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist') as author_display_name
 from public.editorial_documents ed
 join public.features f on f.id=ed.feature_id
 left join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('submitted','approved','changes_requested')
 order by ed.updated_at desc;
$$;

revoke all on function public.editorial_review_inbox() from public,anon,authenticated;
grant execute on function public.editorial_review_inbox() to authenticated;
