-- Template-driven issue covers. Additive fields plus server-enforced save/archive validation.
alter table public.issues
  add column if not exists cover_art text not null default '',
  add column if not exists cover_art_alt text not null default '',
  add column if not exists cover_art_credit text not null default '',
  add column if not exists lead_feature_id uuid references public.features(id) on delete set null,
  add column if not exists lead_headline text not null default '',
  add column if not exists cover_theme text not null default '',
  add column if not exists secondary_cover_lines jsonb not null default '[]'::jsonb,
  add column if not exists editor_note_teaser text not null default '',
  add column if not exists featuring_line text not null default '',
  add column if not exists cover_preset text not null default 'minimal'
    check (cover_preset in ('minimal','feature-heavy','interview-special','archive-classic')),
  add column if not exists cover_updated_by uuid references public.profiles(id),
  add column if not exists cover_updated_at timestamptz;

create table if not exists public.issue_cover_audit (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('saved','archive-validated')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.issue_cover_audit enable row level security;
drop policy if exists issue_cover_audit_read on public.issue_cover_audit;
create policy issue_cover_audit_read on public.issue_cover_audit for select to authenticated
using (public.open_panel_role() in ('moderator','admin'));

create or replace function public.issue_cover_errors(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(error order by position), '[]'::jsonb)
  from public.issues i cross join lateral (
    select 1 position, 'Add an issue title.' error where length(trim(coalesce(i.title,'')))=0
    union all select 2, 'Add an issue number.' where i.issue_number is null
    union all select 3, 'Add a safe issue slug.' where coalesce(i.slug,'') !~ '^[a-z0-9-]{3,80}$'
    union all select 4, 'Choose cover artwork.' where length(trim(coalesce(i.cover_art,'')))=0
    union all select 5, 'Add cover alt text so the issue is accessible.' where length(trim(coalesce(i.cover_art_alt,'')))=0
    union all select 6, 'Choose a published lead panel.' where i.lead_feature_id is null
      or not exists(select 1 from public.features f where f.id=i.lead_feature_id and f.issue_id=i.id and f.status='published' and f.lifecycle_status not in ('draft','taken_down'))
    union all select 7, 'Add a lead headline or use the lead panel title.' where length(trim(coalesce(i.lead_headline,'')))=0
    union all select 8, 'Choose at least one published panel before archiving this issue.' where not exists(
      select 1 from public.features f left join public.editorial_documents ed on ed.feature_id=f.id
      where f.issue_id=i.id and f.status='published' and f.lifecycle_status<>'taken_down'
        and (ed.feature_id is null or ed.lifecycle_status in ('published','archived'))
    )
  ) validation where i.id=target
$$;

create or replace function public.save_issue_cover(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target uuid; issue_row public.issues; lines jsonb; lead uuid; result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform public.require_handbook_acceptance();
  select p.* into actor from public.profiles p where p.id=auth.uid();
  if actor.id is null or actor.account_status<>'active' or actor.role not in ('moderator','admin') then
    raise exception 'Moderator access required' using errcode='42501';
  end if;
  target:=nullif(payload->>'issue_id','')::uuid;
  select * into issue_row from public.issues where id=target for update;
  if issue_row.id is null then raise exception 'Issue not found'; end if;
  if issue_row.status='archived' then raise exception 'Archived covers are read-only'; end if;
  if coalesce(payload->>'slug','') !~ '^[a-z0-9-]{3,80}$' then raise exception 'Use a lowercase issue slug with letters, numbers and hyphens'; end if;
  if length(trim(coalesce(payload->>'title',''))) not between 1 and 150 then raise exception 'Add an issue title'; end if;
  if (payload->>'issue_number')::integer < 0 then raise exception 'Issue number must be zero or greater'; end if;
  if coalesce(payload->>'cover_preset','') not in ('minimal','feature-heavy','interview-special','archive-classic') then raise exception 'Choose a supported cover preset'; end if;
  if length(coalesce(payload->>'cover_art_alt',''))>400 or length(coalesce(payload->>'lead_headline',''))>120 or length(coalesce(payload->>'cover_theme',''))>80 or length(coalesce(payload->>'editor_note_teaser',''))>240 or length(coalesce(payload->>'featuring_line',''))>180 then raise exception 'Cover copy is too long for its slot'; end if;
  if coalesce(payload->>'cover_art','')<>'' and coalesce(payload->>'cover_art','') !~ '^(https://|/assets/|editorial/)' then raise exception 'Choose a safe cover artwork path'; end if;
  lines:=coalesce(payload->'secondary_cover_lines','[]'::jsonb);
  if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)>4 or exists(select 1 from jsonb_array_elements(lines) x where coalesce(x->>'position','') not in ('left-rail','right-rail','bottom-strip','top-kicker') or length(trim(coalesce(x->>'headline',''))) not between 1 and 80) then raise exception 'Use up to four valid secondary cover lines'; end if;
  lead:=nullif(payload->>'lead_feature_id','')::uuid;
  if lead is not null and not exists(select 1 from public.features f where f.id=lead and f.issue_id=target and f.status='published' and f.lifecycle_status not in ('draft','taken_down')) then raise exception 'Choose a published panel from this issue'; end if;
  update public.issues set
    issue_number=(payload->>'issue_number')::integer, slug=payload->>'slug', title=trim(payload->>'title'),
    year=(payload->>'year')::integer, month=(payload->>'month')::integer,
    cover_art=trim(coalesce(payload->>'cover_art','')), cover_art_alt=trim(coalesce(payload->>'cover_art_alt','')),
    cover_art_credit=trim(coalesce(payload->>'cover_art_credit','')), lead_feature_id=lead,
    lead_headline=trim(coalesce(payload->>'lead_headline','')), cover_theme=trim(coalesce(payload->>'cover_theme','')),
    secondary_cover_lines=lines, editor_note_teaser=trim(coalesce(payload->>'editor_note_teaser','')),
    featuring_line=trim(coalesce(payload->>'featuring_line','')), cover_preset=payload->>'cover_preset',
    cover_updated_by=auth.uid(), cover_updated_at=now(), updated_at=now()
  where id=target returning id into result;
  insert into public.issue_cover_audit(issue_id,actor_id,action,details) values(result,auth.uid(),'saved',jsonb_build_object('preset',payload->>'cover_preset'));
  return result;
end $$;

create or replace function public.enforce_issue_cover_before_archive() returns trigger
language plpgsql security definer set search_path='' as $$
declare problems jsonb;
begin
  if new.status='archived' and old.status<>'archived' then
    select public.issue_cover_errors(new.id) into problems;
    if jsonb_array_length(problems)>0 then raise exception 'Cover is not ready: %', problems->>0; end if;
    insert into public.issue_cover_audit(issue_id,actor_id,action) values(new.id,auth.uid(),'archive-validated');
  end if;
  return new;
end $$;
drop trigger if exists issue_cover_archive_guard on public.issues;
create trigger issue_cover_archive_guard before update of status on public.issues for each row execute function public.enforce_issue_cover_before_archive();

revoke all on function public.issue_cover_errors(uuid), public.save_issue_cover(jsonb) from public,anon,authenticated;
grant execute on function public.issue_cover_errors(uuid), public.save_issue_cover(jsonb) to authenticated;
