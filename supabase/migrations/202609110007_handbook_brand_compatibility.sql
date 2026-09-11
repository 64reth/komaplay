-- A narrowly audited bridge for an unchanged conduct compact whose presentation copy changed.
create table public.handbook_acceptance_compatibilities (
 from_version_id uuid not null references public.handbook_versions(id),
 to_version_id uuid not null references public.handbook_versions(id),
 reason text not null check(length(trim(reason)) between 12 and 500),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 primary key (from_version_id, to_version_id),
 check (from_version_id <> to_version_id)
);
alter table public.handbook_acceptance_compatibilities enable row level security;

create or replace function public.has_current_handbook_acceptance() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1
  from public.handbook_versions current_version
  join public.handbook_acceptances acceptance on acceptance.user_id=auth.uid()
  where current_version.active
    and acceptance.statement_version=current_version.statement_version
    and (
      acceptance.handbook_version_id=current_version.id
      or exists(
        select 1 from public.handbook_acceptance_compatibilities bridge
        where bridge.from_version_id=acceptance.handbook_version_id
          and bridge.to_version_id=current_version.id
      )
    )
 )
$$;

create function public.register_handbook_acceptance_compatibility(from_version uuid,to_version uuid,why text) returns void language plpgsql security definer set search_path='' as $$
declare source_version public.handbook_versions; target_version public.handbook_versions;
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into source_version from public.handbook_versions where id=from_version for share;
 select * into target_version from public.handbook_versions where id=to_version for share;
 if source_version.id is null or target_version.id is null or source_version.statement_version<>target_version.statement_version then
  raise exception 'Only handbook versions with the same acceptance compact may be bridged' using errcode='22023';
 end if;
 insert into public.handbook_acceptance_compatibilities(from_version_id,to_version_id,reason,created_by)
 values(from_version,to_version,trim(why),auth.uid()) on conflict(from_version_id,to_version_id) do nothing;
end $$;
revoke all on public.handbook_acceptance_compatibilities from anon,authenticated;
revoke all on function public.register_handbook_acceptance_compatibility(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_handbook_acceptance_compatibility(uuid,uuid,text) to authenticated;
