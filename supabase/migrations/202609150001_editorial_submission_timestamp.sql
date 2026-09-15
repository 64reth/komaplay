-- Repair the column referenced by save_editorial_draft since 202609130006.
-- Independent of the pending broad Phase 5 hardening migration. No data backfill.
begin;

alter table public.editorial_documents
  add column if not exists submitted_at timestamptz;

comment on column public.editorial_documents.submitted_at is
  'First successful transition to submitted. NULL before submission or for legacy rows with unknown submission time. Preserved across revisions and resubmission.';

-- Cover both save_editorial_draft(status=submitted) and submit_editorial_draft.
-- The trigger runs in the RPC transaction: a failed save/submit cannot stamp a row.
create or replace function public.set_editorial_submitted_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_at := case when new.lifecycle_status = 'submitted' then now() else null end;
  elsif new.lifecycle_status = 'submitted' and old.lifecycle_status is distinct from 'submitted' then
    new.submitted_at := coalesce(old.submitted_at, now());
  else
    new.submitted_at := old.submitted_at;
  end if;
  return new;
end;
$$;

revoke all on function public.set_editorial_submitted_at() from public, anon, authenticated;
drop trigger if exists editorial_submitted_at on public.editorial_documents;
create trigger editorial_submitted_at
  before insert or update of lifecycle_status, submitted_at
  on public.editorial_documents
  for each row execute function public.set_editorial_submitted_at();

commit;
