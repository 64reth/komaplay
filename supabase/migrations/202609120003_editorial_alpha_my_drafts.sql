-- Focused Phase 4A repair: let an editor see their own saved/submitted editorial drafts without weakening draft feature RLS.
create or replace function public.editorial_my_drafts() returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb) language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,ed.lifecycle_status,ed.updated_at,ed.working_document
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id
 where ed.author_id=auth.uid() and public.editorial_has_access(auth.uid(),false)
 order by ed.updated_at desc;
$$;

revoke all on function public.editorial_my_drafts() from public,anon,authenticated;
grant execute on function public.editorial_my_drafts() to authenticated;
