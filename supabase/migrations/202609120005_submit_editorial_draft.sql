-- Focused repair: submit an existing editorial draft by id without requiring the full composer payload.
create or replace function public.submit_editorial_draft(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
 can_review boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),false) then raise exception 'Editorial access required' using errcode='42501'; end if;
 can_review := public.editorial_has_access(auth.uid(),true);
 select * into doc from public.editorial_documents where feature_id=target for update;
 if doc.feature_id is null then raise exception 'Draft not found'; end if;
 if doc.author_id<>auth.uid() and not can_review then raise exception 'Draft belongs to another editor' using errcode='42501'; end if;
 if doc.lifecycle_status='submitted' then return target; end if;
 if doc.lifecycle_status not in ('draft','changes_requested') then raise exception 'Only draft or changes-requested panels can be submitted for review'; end if;
 update public.editorial_documents set lifecycle_status='submitted',updated_at=now(),revision_token=gen_random_uuid() where feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Submitted for review',auth.uid());
 return target;
end $$;

revoke all on function public.submit_editorial_draft(uuid) from public,anon,authenticated;
grant execute on function public.submit_editorial_draft(uuid) to authenticated;
