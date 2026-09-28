-- Private committee records never join the public catalogue.
create function public.cover_committee_access() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and account_status='active' and role in ('moderator','admin'))
$$;
create table public.issue_cover_candidates (
 id uuid primary key default gen_random_uuid(),
 issue_id uuid not null references public.issues(id),
 created_by uuid not null references public.profiles(id),
 status text not null default 'draft' check(status in ('draft','submitted','withdrawn','selected','not-selected')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 submitted_at timestamptz, selected_at timestamptz
);
create unique index cover_candidate_unique_art on public.issue_cover_candidates ((payload->>'cover_art')) where coalesce(payload->>'cover_art','')<>'';
create unique index issue_one_selected_cover on public.issue_cover_candidates(issue_id) where status='selected';
create table public.issue_cover_votes (
 issue_id uuid not null references public.issues(id), voter_id uuid not null references public.profiles(id),
 candidate_id uuid not null references public.issue_cover_candidates(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(issue_id,voter_id)
);
alter table public.issue_cover_candidates enable row level security;
alter table public.issue_cover_votes enable row level security;
revoke all on public.issue_cover_candidates,public.issue_cover_votes from public,anon,authenticated;
grant select on public.issue_cover_candidates,public.issue_cover_votes to authenticated;
create policy cover_candidates_private on public.issue_cover_candidates for select to authenticated using (
 public.cover_committee_access() and (status not in ('draft','withdrawn') or created_by=auth.uid() or public.open_panel_role()='admin')
);
create policy cover_votes_private on public.issue_cover_votes for select to authenticated using(public.cover_committee_access());
drop policy issue_cover_audit_read on public.issue_cover_audit;
create policy issue_cover_audit_read on public.issue_cover_audit for select to authenticated using(public.cover_committee_access());

-- Keep the existing cover validator/writer internal. Legacy saves cannot bypass selection.
alter function public.save_issue_cover(jsonb) rename to save_issue_cover_internal;
revoke all on function public.save_issue_cover_internal(jsonb) from public,anon,authenticated;
create or replace function public.save_issue_cover_internal(payload jsonb) returns uuid
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
  if coalesce(payload->>'cover_art','')<>'' and coalesce(payload->>'cover_art','') !~ '^(https://|/assets/|editorial/|cover-pool/)' then raise exception 'Choose a safe cover artwork path'; end if;
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

create function public.save_issue_cover(payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501'; end if;
 perform 1 from public.issues where id=(payload->>'issue_id')::uuid for update;
 if exists(select 1 from public.issue_cover_candidates where issue_id=(save_issue_cover.payload->>'issue_id')::uuid and status='selected')
 or coalesce(payload->>'cover_art','') like 'cover-pool/%' then raise exception 'Use the confirmed Cover Pool selection'; end if;
 return public.save_issue_cover_internal(payload);
end $$;

create function public.cover_pool_action(operation text, target_issue uuid, target_candidate uuid default null, draft jsonb default '{}'::jsonb, confirmed boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.issues; c public.issue_cover_candidates; result uuid; problems jsonb; p jsonb;
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 -- Serialize all edits, submissions, votes and selections for this issue.
 select * into i from public.issues where id=target_issue for update;
 if i.id is null then raise exception 'Issue not found'; end if;
 if i.status='archived' then raise exception 'Archived covers are read-only'; end if;
 if exists(select 1 from public.issue_cover_candidates where issue_id=i.id and status='selected') then raise exception 'Official cover selected; the committee is closed'; end if;
 if target_candidate is not null then
  select * into c from public.issue_cover_candidates where id=target_candidate and issue_id=i.id for update;
  if c.id is null then raise exception 'Candidate not found'; end if;
 end if;
 if operation='save' then
  if c.id is not null and (c.created_by<>auth.uid() or c.status<>'draft') then raise exception 'Only your draft can be edited'; end if;
  if c.id is null and (select count(*) from public.issue_cover_candidates where issue_id=i.id and created_by=auth.uid())>=2 then raise exception 'You can create up to 2 cover candidates for this issue'; end if;
  if jsonb_typeof(draft)<>'object' then raise exception 'Invalid cover draft'; end if;
  p:=jsonb_build_object('cover_art','','cover_art_alt','','cover_art_credit','','lead_feature_id','','lead_headline','','cover_theme','','secondary_cover_lines','[]'::jsonb,'editor_note_teaser','','featuring_line','','cover_preset','minimal') || draft || jsonb_build_object('issue_id',i.id,'issue_number',i.issue_number::text,'title',i.title,'slug',i.slug,'year',i.year::text,'month',i.month::text);
  if jsonb_typeof(p->'secondary_cover_lines') is distinct from 'array' or exists(select 1 from jsonb_each(p) e where e.key<>'secondary_cover_lines' and jsonb_typeof(e.value)<>'string') then raise exception 'Invalid cover draft fields'; end if;
  if coalesce(p->>'cover_art','')<>'' and p->>'cover_art' !~ '^cover-pool/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then raise exception 'Upload private Cover Pool artwork'; end if;
  if coalesce(p->>'cover_art','')<>'' and not exists(select 1 from storage.objects where bucket_id='issue-cover-pool' and name=p->>'cover_art' and owner_id=auth.uid()::text) then raise exception 'Upload your own private artwork'; end if;
  if c.id is null then insert into public.issue_cover_candidates(issue_id,created_by,payload) values(i.id,auth.uid(),p) returning id into result;
  else update public.issue_cover_candidates set payload=p,updated_at=now() where id=c.id returning id into result; end if;
  return result;
 elsif operation='submit' then
  if c.id is null or c.created_by<>auth.uid() or c.status<>'draft' then raise exception 'Only your draft can be submitted'; end if;
  p:=c.payload;
  if length(trim(coalesce(p->>'cover_art','')))=0 or length(trim(coalesce(p->>'cover_art_alt','')))=0 or length(trim(coalesce(p->>'lead_headline','')))=0 then raise exception 'Add artwork, alt text and a lead headline'; end if;
  if coalesce(p->>'cover_preset','') not in ('minimal','feature-heavy','interview-special','archive-classic') then raise exception 'Choose a supported preset'; end if;
  if length(coalesce(p->>'cover_art_alt',''))>400 or length(coalesce(p->>'lead_headline',''))>120 or length(coalesce(p->>'cover_theme',''))>80 or length(coalesce(p->>'editor_note_teaser',''))>240 or length(coalesce(p->>'featuring_line',''))>180 then raise exception 'Cover copy is too long for its slot'; end if;
  if jsonb_typeof(p->'secondary_cover_lines') is distinct from 'array' then raise exception 'Invalid secondary cover lines'; end if;
  if jsonb_array_length(p->'secondary_cover_lines')>4 or exists(select 1 from jsonb_array_elements(p->'secondary_cover_lines') x where coalesce(x->>'position','') not in ('left-rail','right-rail','bottom-strip','top-kicker') or length(trim(coalesce(x->>'headline',''))) not between 1 and 80) then raise exception 'Invalid secondary cover lines'; end if;
  if not exists(select 1 from public.features where id=nullif(p->>'lead_feature_id','')::uuid and issue_id=i.id and status='published' and lifecycle_status not in ('draft','taken_down')) then raise exception 'Choose a published panel from this issue'; end if;
  if length(trim(i.title))=0 or i.issue_number is null or i.slug !~ '^[a-z0-9-]{3,80}$' then raise exception 'Complete issue identity first'; end if;
  update public.issue_cover_candidates set status='submitted',submitted_at=now(),updated_at=now() where id=c.id;
 elsif operation='withdraw' then
  if c.id is null or c.created_by<>auth.uid() or c.status<>'submitted' then raise exception 'Only your submitted cover can be withdrawn'; end if;
  delete from public.issue_cover_votes where candidate_id=c.id;
  update public.issue_cover_candidates set status='withdrawn',updated_at=now() where id=c.id;
 elsif operation='vote' then
  if c.id is null or c.status<>'submitted' then raise exception 'Choose a submitted candidate'; end if;
  insert into public.issue_cover_votes(issue_id,voter_id,candidate_id) values(i.id,auth.uid(),c.id)
   on conflict(issue_id,voter_id) do update set candidate_id=excluded.candidate_id,updated_at=now();
 elsif operation='select' then
  if confirmed is distinct from true then raise exception 'Confirm replacement of the official issue cover'; end if;
  if c.id is null or c.status<>'submitted' then raise exception 'Choose a submitted candidate'; end if;
  if (select count(*) from public.issue_cover_votes where candidate_id=c.id)<(select coalesce(max(votes),0) from (select count(*) votes from public.issue_cover_votes where issue_id=i.id group by candidate_id) totals) then raise exception 'Select a candidate with the most votes'; end if;
  perform public.save_issue_cover_internal(c.payload || jsonb_build_object('issue_id',i.id,'issue_number',i.issue_number::text,'title',i.title,'slug',i.slug,'year',i.year::text,'month',i.month::text));
  update public.issues set cover_updated_by=null where id=i.id;
  problems:=public.issue_cover_errors(i.id);
  if jsonb_array_length(problems)>0 then raise exception 'Cover is not ready: %',problems->>0; end if;
  update public.issue_cover_candidates set status=case when id=c.id then 'selected' else 'not-selected' end, selected_at=case when id=c.id then now() else null end,updated_at=now() where issue_id=i.id and status='submitted';
  insert into public.issue_cover_audit(issue_id,actor_id,action,details) values(i.id,auth.uid(),'saved',jsonb_build_object('selection',c.id,'previous_cover_art',i.cover_art,'votes',(select count(*) from public.issue_cover_votes where candidate_id=c.id)));
 else raise exception 'Unknown cover action'; end if;
 return c.id;
end $$;

-- Public image access is derived only from the selected cover of an archived issue.
create function public.cover_pool_image_public(asset text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.issues i join public.issue_cover_candidates c on c.issue_id=i.id and c.status='selected' where i.status='archived' and i.cover_art=asset and c.payload->>'cover_art'=asset)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('issue-cover-pool','issue-cover-pool',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy cover_pool_upload on storage.objects for insert to authenticated with check(
 bucket_id='issue-cover-pool' and public.cover_committee_access() and public.has_current_handbook_acceptance()
 and name ~ '^cover-pool/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' and owner_id=auth.uid()::text
);
create policy cover_pool_image_read on storage.objects for select to authenticated using(
 bucket_id='issue-cover-pool' and public.cover_committee_access() and (
 owner_id=auth.uid()::text or public.open_panel_role()='admin' or exists(select 1 from public.issue_cover_candidates c where c.payload->>'cover_art'=name and c.status not in ('draft','withdrawn')))
);
create policy cover_pool_official_image_read on storage.objects for select to anon,authenticated using(bucket_id='issue-cover-pool' and public.cover_pool_image_public(name));
revoke all on function public.cover_committee_access(),public.cover_pool_action(text,uuid,uuid,jsonb,boolean),public.cover_pool_image_public(text),public.save_issue_cover(jsonb) from public,anon,authenticated;
grant execute on function public.cover_committee_access(),public.cover_pool_action(text,uuid,uuid,jsonb,boolean),public.save_issue_cover(jsonb) to authenticated;
grant execute on function public.cover_pool_image_public(text) to anon,authenticated;
