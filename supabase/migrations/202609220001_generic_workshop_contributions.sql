-- Contributions now target a canonical feature rather than a prototype-only
-- article section. Preserve the column and every historical value because
-- published additions and citations still depend on them.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.contributions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%target_section%';
  if constraint_name is not null then
    execute format('alter table public.contributions drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.contributions
  alter column target_section set default 'Contribution';
