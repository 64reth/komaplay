-- Focused repair: remove ambiguous status references from save_editorial_draft.
-- The route/action path is proven; this function failed with SQLSTATE 42702 because a local variable named status conflicted with table status columns.

create or replace function public.save_editorial_draft(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 target uuid:=nullif(payload->>'feature_id','')::uuid;
 target_issue_id uuid;
 drop_id uuid;
 category_id uuid;
 format_id uuid;
 result uuid;
 doc jsonb;
 requested_status text:=coalesce(payload->>'status','draft');
 storage_status text;
 existing public.features;
 existing_doc public.editorial_documents;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles p where p.id=auth.uid();
 if actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 if requested_status not in ('draft','submitted','changes_requested') then raise exception 'Invalid draft status'; end if;
 storage_status:=requested_status;
 if length(trim(payload->>'title'))<4 or length(trim(payload->>'slug'))<3 then raise exception 'Title and slug are required'; end if;
 if (payload->>'slug') !~ '^[a-z0-9-]{3,80}$' then raise exception 'Use a URL-safe slug'; end if;
 doc:=payload->'document';
 if doc is null or jsonb_typeof(doc)<>'object' then raise exception 'Structured document is required'; end if;
 target_issue_id:=nullif(payload->>'issue_id','')::uuid;
 drop_id:=nullif(payload->>'weekly_drop_id','')::uuid;
 category_id:=nullif(payload->>'category_id','')::uuid;
 format_id:=nullif(payload->>'format_id','')::uuid;
 if target_issue_id is null then select i.id into target_issue_id from public.issues i where i.status='current' order by i.opens_at desc limit 1; end if;
 if target_issue_id is null then select i.id into target_issue_id from public.issues i order by i.issue_number desc limit 1; end if;
 if drop_id is null then select wd.id into drop_id from public.weekly_drops wd where wd.issue_id=target_issue_id order by wd.display_order,wd.week_number limit 1; end if;
 if category_id is null then select c.id into category_id from public.categories c order by c.name limit 1; end if;
 if format_id is null then select cf.id into format_id from public.content_formats cf where cf.slug='essay' limit 1; end if;
 if target_issue_id is null or drop_id is null or category_id is null or format_id is null then raise exception 'Publication defaults are unavailable'; end if;
 if target is not null then
  select * into existing from public.features f where f.id=target for update;
  select * into existing_doc from public.editorial_documents ed where ed.feature_id=target for update;
  if existing.id is null or existing_doc.feature_id is null then raise exception 'Draft not found'; end if;
  if existing_doc.author_id<>auth.uid() and actor.role<>'admin' then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
  if existing_doc.lifecycle_status in ('submitted','approved','published','archived','scheduled') and storage_status<>'submitted' then raise exception 'This panel is not editable in its current status'; end if;
  if existing.lifecycle_status<>'draft' then raise exception 'Only unpublished editorial features can be edited here'; end if;
  update public.features f set slug=trim(payload->>'slug'),title=trim(payload->>'title'),summary=coalesce(payload->>'summary',''),editorial_body=coalesce(payload->>'body',''),category_id=category_id,format_id=format_id,image=coalesce(nullif(payload->>'image',''),f.image),image_alt=coalesce(payload->>'image_alt',''),updated_at=now() where f.id=target returning f.id into result;
 else
  if storage_status='changes_requested' then storage_status:='draft'; end if;
  insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,status,summary,editorial_body,image,image_alt,panel_size,panel_class)
  values(trim(payload->>'slug'),trim(payload->>'title'),target_issue_id,drop_id,999,category_id,format_id,'draft','draft',coalesce(payload->>'summary',''),coalesce(payload->>'body',''),coalesce(nullif(payload->>'image',''),'/assets/koma-vhs-v2.svg'),coalesce(payload->>'image_alt',''),'standard','') returning id into result;
  insert into public.revisions(feature_id,revision_number,summary) values(result,1,'Editorial draft created.');
 end if;
 insert into public.editorial_documents(feature_id,schema_version,working_document,author_id,lifecycle_status,updated_at)
 values(result,1,doc,auth.uid(),storage_status,now())
 on conflict(feature_id) do update set working_document=excluded.working_document,lifecycle_status=excluded.lifecycle_status,updated_at=now(),revision_token=gen_random_uuid();
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(result,1,doc,case when storage_status='submitted' then 'Submitted for review' when storage_status='changes_requested' then 'Saved revision after changes requested' else 'Saved draft' end,auth.uid());
 return result;
end $$;

revoke all on function public.save_editorial_draft(jsonb) from public,anon,authenticated;
grant execute on function public.save_editorial_draft(jsonb) to authenticated;
