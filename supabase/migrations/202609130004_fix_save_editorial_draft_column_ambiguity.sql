-- Focused repair: remove remaining PL/pgSQL column/local-name ambiguity from save_editorial_draft.
-- Uses prefixed local variable names and qualified table aliases. No table or policy changes.

create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_actor public.profiles;
 v_target uuid:=nullif(payload->>'feature_id','')::uuid;
 v_issue_id uuid;
 v_drop_id uuid;
 v_category_id uuid;
 v_format_id uuid;
 v_result uuid;
 v_doc jsonb;
 v_requested_status text:=coalesce(payload->>'status','draft');
 v_storage_status text;
 v_existing public.features;
 v_existing_doc public.editorial_documents;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into v_actor from public.profiles p where p.id=auth.uid();
 if v_actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if v_requested_status not in ('draft','submitted','changes_requested') then raise exception 'Invalid draft status'; end if;
 v_storage_status:=v_requested_status;
 if length(trim(payload->>'title'))<4 or length(trim(payload->>'slug'))<3 then raise exception 'Title and slug are required'; end if;
 if (payload->>'slug') !~ '^[a-z0-9-]{3,80}$' then raise exception 'Use a URL-safe slug'; end if;
 v_doc:=payload->'document';
 if v_doc is null or jsonb_typeof(v_doc)<>'object' then raise exception 'Structured document is required'; end if;
 v_issue_id:=nullif(payload->>'issue_id','')::uuid;
 v_drop_id:=nullif(payload->>'weekly_drop_id','')::uuid;
 v_category_id:=nullif(payload->>'category_id','')::uuid;
 v_format_id:=nullif(payload->>'format_id','')::uuid;
 if v_issue_id is null then select i.id into v_issue_id from public.issues i where i.status='current' order by i.opens_at desc limit 1; end if;
 if v_issue_id is null then select i.id into v_issue_id from public.issues i order by i.issue_number desc limit 1; end if;
 if v_drop_id is null then select wd.id into v_drop_id from public.weekly_drops wd where wd.issue_id=v_issue_id order by wd.display_order,wd.week_number limit 1; end if;
 if v_category_id is null then select c.id into v_category_id from public.categories c order by c.name limit 1; end if;
 if v_format_id is null then select cf.id into v_format_id from public.content_formats cf where cf.slug='essay' limit 1; end if;
 if v_issue_id is null or v_drop_id is null or v_category_id is null or v_format_id is null then raise exception 'Publication defaults are unavailable'; end if;
 if v_target is not null then
  select f.* into v_existing from public.features f where f.id=v_target for update;
  select ed.* into v_existing_doc from public.editorial_documents ed where ed.feature_id=v_target for update;
  if v_existing.id is null or v_existing_doc.feature_id is null then raise exception 'Draft not found'; end if;
  if v_existing_doc.author_id<>auth.uid() and v_actor.role<>'admin' then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
  if v_existing_doc.lifecycle_status in ('submitted','approved','published','archived','scheduled') and v_storage_status<>'submitted' then raise exception 'This panel is not editable in its current status'; end if;
  if v_existing.lifecycle_status<>'draft' then raise exception 'Only unpublished editorial features can be edited here'; end if;
  update public.features f
     set slug=trim(payload->>'slug'),
         title=trim(payload->>'title'),
         summary=coalesce(payload->>'summary',''),
         editorial_body=coalesce(payload->>'body',''),
         category_id=v_category_id,
         format_id=v_format_id,
         image=coalesce(nullif(payload->>'image',''),f.image),
         image_alt=coalesce(payload->>'image_alt',''),
         updated_at=now()
   where f.id=v_target
   returning f.id into v_result;
 else
  if v_storage_status='changes_requested' then v_storage_status:='draft'; end if;
  insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,status,summary,editorial_body,image,image_alt,panel_size,panel_class)
  values(trim(payload->>'slug'),trim(payload->>'title'),v_issue_id,v_drop_id,999,v_category_id,v_format_id,'draft','draft',coalesce(payload->>'summary',''),coalesce(payload->>'body',''),coalesce(nullif(payload->>'image',''),'/assets/koma-vhs-v2.svg'),coalesce(payload->>'image_alt',''),'standard','') returning id into v_result;
  insert into public.revisions(feature_id,revision_number,summary) values(v_result,1,'Editorial draft created.');
 end if;
 insert into public.editorial_documents(feature_id,schema_version,working_document,author_id,lifecycle_status,updated_at)
 values(v_result,1,v_doc,auth.uid(),v_storage_status,now())
 on conflict(feature_id) do update set working_document=excluded.working_document,lifecycle_status=excluded.lifecycle_status,updated_at=now(),revision_token=gen_random_uuid();
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(v_result,1,v_doc,case when v_storage_status='submitted' then 'Submitted for review' when v_storage_status='changes_requested' then 'Saved revision after changes requested' else 'Saved draft' end,auth.uid());
 return v_result;
end $$;

revoke all on function public.save_editorial_draft(jsonb) from public,anon,authenticated;
grant execute on function public.save_editorial_draft(jsonb) to authenticated;
