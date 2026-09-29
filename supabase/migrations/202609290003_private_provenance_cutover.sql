-- B: apply immediately after the prepared Worker is active. Never reverse these protections for availability.


-- Staff retain original rows. Public callers, including ordinary signed-in members,
-- use explicit projections; a session must not unlock anonymous provenance.
alter policy feature_read on public.features using(public.has_current_handbook_acceptance() and public.editorial_has_access(auth.uid(),false));

alter policy issues_read on public.issues using(public.cover_committee_access());

alter policy addition_read on public.published_additions using(public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') and (contributor_id=auth.uid() or public.open_panel_role() in ('moderator','admin')));

alter policy revision_read on public.revisions using(public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') and public.open_panel_role() in ('moderator','admin'));

revoke select on public.features,public.issues,public.published_additions,public.revisions from anon;

-- Raw-issue RLS must not hide public drops through its existence join.
alter policy drops_read on public.weekly_drops using((status='published' and published_at<=now() and exists(select 1 from public.public_issues i where i.id=issue_id)) or public.open_panel_role() in ('moderator','admin'));

revoke select on public.panel_citations from anon;

alter policy public_panel_citations on public.panel_citations to authenticated using(public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') and (public.open_panel_role() in ('moderator','admin') or exists(select 1 from public.contributions c where c.id=contribution_id and c.author_id=auth.uid())));


-- Public media uses the gateway. Original names, metadata and signing are private.
alter policy screenshot_read on storage.objects to authenticated using(bucket_id='open-panel-screenshots' and public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') and ((storage.foldername(name))[1]=auth.uid()::text or public.open_panel_role() in ('moderator','admin')));

alter policy editorial_feature_image_published_read on storage.objects to authenticated using(bucket_id='editorial-feature-images' and public.has_current_handbook_acceptance() and public.editorial_has_access(auth.uid(),false) and public.editorial_image_readable(name));

drop policy cover_pool_official_image_read on storage.objects;

revoke execute on function public.editorial_image_readable(text) from anon;


-- Public handbook metadata does not need the account that published it.
revoke select on public.handbook_versions from anon,authenticated;

do $$ declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid='public.handbook_versions'::regclass and attnum>0 and not attisdropped and attname<>'created_by';
 execute 'grant select ('||columns||') on public.handbook_versions to anon,authenticated';
end $$;

-- Keep anonymous handbook reads independent of the private acceptance table.
alter policy handbook_read on public.handbook_versions to authenticated;

create policy handbook_public_read on public.handbook_versions for select to anon using(active);
create or replace view public.public_profiles with (security_barrier=true) as
 select id,display_name,avatar_url from public.public_credit_profiles;
create or replace function public.public_editorial_document(feature_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.public_attributed_document(feature_slug)
$$;
