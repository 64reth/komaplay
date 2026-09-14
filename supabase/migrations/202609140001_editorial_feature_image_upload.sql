-- Phase 4F editorial feature image upload alpha.
-- Adds a private bucket for one main editorial feature image per panel.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('editorial-feature-images','editorial-feature-images',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types,
  public=false;

create policy editorial_feature_image_upload on storage.objects
  for insert to authenticated
  with check(
    bucket_id='editorial-feature-images'
    and public.has_current_handbook_acceptance()
    and public.editorial_has_access(auth.uid(),false)
    and (storage.foldername(name))[1]='editorial'
    and (storage.foldername(name))[2]=auth.uid()::text
    and name ~ '^editorial/[0-9a-f-]{36}/[a-z0-9-]{3,80}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  );

create policy editorial_feature_image_owner_read on storage.objects
  for select to authenticated
  using(
    bucket_id='editorial-feature-images'
    and public.has_current_handbook_acceptance()
    and (storage.foldername(name))[1]='editorial'
    and (storage.foldername(name))[2]=auth.uid()::text
  );

create policy editorial_feature_image_published_read on storage.objects
  for select to anon,authenticated
  using(
    bucket_id='editorial-feature-images'
    and exists(
      select 1 from public.features f
      left join public.editorial_documents ed on ed.feature_id=f.id
      where f.status='published'
        and f.lifecycle_status <> 'taken_down'
        and coalesce(ed.lifecycle_status,f.lifecycle_status) in ('published','archived')
        and f.image = '/api/editorial/image?path=' || storage.objects.name
    )
  );
