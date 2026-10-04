-- Permanent two-gate monthly closure: calendar month ended + valid submitted cover.
-- No data repair, automatic submission, lead choice or new Issue creation.
create or replace function public.issue_cover_errors(target uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(error order by position), '[]'::jsonb)
  from public.issues i cross join lateral (
    select 1 position, 'Add an issue title.' error where length(trim(coalesce(i.title,'')))=0
    union all select 2, 'Add an issue number.' where i.issue_number is null
    union all select 3, 'Add a safe issue slug.' where coalesce(i.slug,'') !~ '^[a-z0-9-]{3,80}$'
    union all select 4, 'Choose cover artwork.' where length(trim(coalesce(i.cover_art,'')))=0
    union all select 5, 'Add cover alt text so the issue is accessible.' where length(trim(coalesce(i.cover_art_alt,'')))=0
    union all select 7, 'Add a lead headline or use the lead panel title.' where length(trim(coalesce(i.lead_headline,'')))=0
  ) validation where i.id=target
$$;


-- Submission does not require a lead Panel. All authority, limits and vote rules remain intact.
create or replace function public.cover_pool_action(operation text, target_issue uuid, target_candidate uuid default null, draft jsonb default '{}'::jsonb, confirmed boolean default false) returns uuid
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

-- Internal eligibility check; revalidate storage/copy at reconciliation, not just at submission.
create function public.rollover_cover_candidate_valid(candidate uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p jsonb;
begin
 select payload into p from public.issue_cover_candidates where id=candidate and status in ('submitted','selected') and submitted_at is not null;
 if p is null then return false;end if;
 if length(trim(coalesce(p->>'cover_art_alt',''))) not between 1 and 400
 or length(trim(coalesce(p->>'lead_headline',''))) not between 1 and 120
 or coalesce(p->>'cover_preset','') not in ('minimal','feature-heavy','interview-special','archive-classic')
 or length(coalesce(p->>'cover_theme',''))>80 or length(coalesce(p->>'editor_note_teaser',''))>240 or length(coalesce(p->>'featuring_line',''))>180 then return false;end if;
 if jsonb_typeof(p->'secondary_cover_lines') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'secondary_cover_lines')>4 or exists(select 1 from jsonb_array_elements(p->'secondary_cover_lines') x where coalesce(x->>'position','') not in ('left-rail','right-rail','bottom-strip','top-kicker') or length(trim(coalesce(x->>'headline',''))) not between 1 and 80) then return false;end if;
 return exists(select 1 from storage.objects o where o.name=p->>'cover_art' and
  ((o.bucket_id='issue-cover-pool' and o.name like 'cover-pool/%') or (o.bucket_id='editorial-feature-images' and o.name like 'editorial/%')));
end $$;
revoke all on function public.rollover_cover_candidate_valid(uuid) from public,anon,authenticated;

alter table public.issue_rollover alter column message set default 'AWAITING COVER: submit a valid cover to this Issue’s Cover Pool.';

create or replace function public.run_issue_rollover() returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; c public.issue_cover_candidates; eligible uuid[]; winners uuid[]; p jsonb; problems jsonb; results jsonb:='[]'; method text;
begin
 perform pg_advisory_xact_lock(hashtextextended('koma-issue-rollover',0));
 -- Calendar identity is authoritative. No deadline, lead, confirmation or pause is a third gate.
 for i in select * from public.issues where status in ('current','finalising')
 and ((make_date(year,month,1)+interval '1 month') at time zone 'UTC')<=now() order by year,month,id for update loop
  begin
   insert into public.issue_rollover(issue_id) values(i.id) on conflict do nothing;
   c:=null; method:=null;
   select * into c from public.issue_cover_candidates where issue_id=i.id and status='selected' and public.rollover_cover_candidate_valid(id);
   if c.id is not null then method:='preserved-confirmed-selection';
   else
    select array_agg(id order by id) into eligible from public.issue_cover_candidates where issue_id=i.id and status='submitted' and public.rollover_cover_candidate_valid(id);
    if coalesce(cardinality(eligible),0)=0 then
     update public.issue_rollover set phase='needs_editorial',message='AWAITING COVER: submit a valid cover to this Issue’s Cover Pool.',checked_at=now() where issue_id=i.id;
    elsif exists(select 1 from public.issue_cover_candidates where issue_id=i.id and status='selected') then
     update public.issue_rollover set phase='needs_editorial',message='AWAITING COVER: the confirmed selection is no longer valid; restore its artwork or resolve the selection.',checked_at=now() where issue_id=i.id;
    else
     if cardinality(eligible)=1 then
      select * into c from public.issue_cover_candidates where id=eligible[1];method:='only-eligible-submission';
     else
      -- Existing most-votes mechanism: only a unique leader is deterministic. Ties need editorial selection.
      with totals as (select candidate.id,count(v.voter_id) votes from public.issue_cover_candidates candidate left join public.issue_cover_votes v on v.candidate_id=candidate.id and v.issue_id=i.id where candidate.id=any(eligible) group by candidate.id)
      select array_agg(id order by id) into winners from totals where votes=(select max(votes) from totals);
      if cardinality(winners)=1 then select * into c from public.issue_cover_candidates where id=winners[1];method:='unique-vote-leader';
      else update public.issue_rollover set phase='needs_editorial',message='AWAITING COVER SELECTION: multiple submitted covers are tied; confirm a selection in Cover Pool.',checked_at=now() where issue_id=i.id;end if;
     end if;
    end if;
   end if;
   if c.id is not null then
    p:=c.payload;
    -- Use only the chosen submission's cover, retaining exact Issue identity and published membership.
    update public.issues set cover_art=p->>'cover_art',cover_art_alt=p->>'cover_art_alt',cover_art_credit=coalesce(p->>'cover_art_credit',''),
     lead_feature_id=nullif(p->>'lead_feature_id','')::uuid,lead_headline=p->>'lead_headline',cover_theme=coalesce(p->>'cover_theme',''),secondary_cover_lines=p->'secondary_cover_lines',
     editor_note_teaser=coalesce(p->>'editor_note_teaser',''),featuring_line=coalesce(p->>'featuring_line',''),cover_preset=p->>'cover_preset',
     cover_updated_by=null,cover_updated_at=case when c.status='selected' then cover_updated_at else now() end,updated_at=now() where id=i.id;
    problems:=public.issue_cover_errors(i.id);
    if jsonb_array_length(problems)>0 then raise exception 'Invalid submitted cover: %',problems->>0;end if;
    if c.status<>'selected' then
     update public.issue_cover_candidates set status=case when id=c.id then 'selected' else 'not-selected' end,selected_at=case when id=c.id then now() else null end,updated_at=now() where issue_id=i.id and status='submitted';
     insert into public.issue_cover_audit(issue_id,actor_id,action,details) values(i.id,c.created_by,'saved',jsonb_build_object('selection',c.id,'automatic',true,'method',method,'actor_basis','submission-author','previous_cover_art',i.cover_art,'votes',(select count(*) from public.issue_cover_votes where candidate_id=c.id)));
    end if;
    update public.issue_rollover set cover_snapshot=public.issue_rollover_cover(i.id),confirmed_by=c.created_by,confirmed_at=coalesce(c.selected_at,now()) where issue_id=i.id;
    update public.features f set lifecycle_status='archived',finalised_at=coalesce(f.finalised_at,now()),archived_at=coalesce(f.archived_at,now()),updated_at=now() where f.issue_id=i.id and public.feature_is_public(f.id);
    with archived as (
     update public.editorial_documents ed set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid()
     where ed.lifecycle_status='published' and exists(select 1 from public.features f where f.id=ed.feature_id and f.issue_id=i.id and f.lifecycle_status='archived') returning ed.*
    ) insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
      select feature_id,schema_version,working_document,'Archived by monthly Issue rollover',c.created_by from archived;
    update public.issues set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() where id=i.id;
    update public.issue_rollover set phase='archived',message='Archived: calendar month ended and submitted cover selected ('||method||').',checked_at=now() where issue_id=i.id;
   end if;
  exception when others then
   insert into public.issue_rollover(issue_id,phase,message) values(i.id,'error','Rollover failed; retry required. SQLSTATE '||sqlstate)
   on conflict(issue_id) do update set phase='error',message=excluded.message,checked_at=now();
  end;
  results:=results||jsonb_build_array((select jsonb_build_object('issue',i.issue_number,'phase',phase) from public.issue_rollover where issue_id=i.id));
 end loop;
 update public.weekly_drops d set status='published',published_at=d.scheduled_at,updated_at=now() from public.issues parent
 where parent.id=d.issue_id and parent.status='current' and now()>=parent.opens_at and now()<parent.closes_at and d.status='scheduled' and d.scheduled_at<=now() and d.scheduled_at>=parent.opens_at and d.scheduled_at<parent.closes_at;
 return results;
end $$;
