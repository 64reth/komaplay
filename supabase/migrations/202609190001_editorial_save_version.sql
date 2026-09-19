-- Return the version established by this save while its row lock is still held.
-- Existing author, lifecycle and optimistic-concurrency checks remain authoritative.
create function public.save_editorial_draft_versioned(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved_id uuid; saved_at timestamptz;
begin
 saved_id := public.save_editorial_draft(payload);
 select updated_at into strict saved_at from public.editorial_documents where feature_id=saved_id;
 return jsonb_build_object('feature_id',saved_id,'updated_at',saved_at);
end $$;
revoke all on function public.save_editorial_draft_versioned(jsonb) from public,anon;
grant execute on function public.save_editorial_draft_versioned(jsonb) to authenticated;
