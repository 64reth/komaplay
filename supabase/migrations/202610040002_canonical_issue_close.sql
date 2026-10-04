-- One transaction for manual and scheduled closure. No Issue guessing or implicit creation.
create function public.issue_close_state_internal(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.issues; chosen uuid; eligible uuid[]; winners uuid[]; result jsonb; r public.issue_rollover; method text;
begin
 select * into i from public.issues where id=target;
 if i.id is null then return jsonb_build_object('status','BLOCKED','lifecycle_state','CLOSE FAILED','reason','Issue not found. Refresh and choose an existing Issue.');end if;
 result:=jsonb_build_object('issueId',i.id,'issueSlug',i.slug,'issueTitle',i.title,'issue_status',i.status,'archived_at',i.archived_at,'includedPanelCount',(select count(*) from public.features f where f.issue_id=i.id and public.feature_is_public(f.id)));
 if i.status='archived' and exists(select 1 from public.issue_cover_candidates c where c.issue_id=i.id and c.status='selected' and public.rollover_cover_candidate_valid(c.id) and c.payload->>'cover_art'=i.cover_art) then return result||jsonb_build_object('status','ALREADY_ARCHIVED','lifecycle_state','ARCHIVED','reason','Issue was already archived.');end if;
 if i.status not in ('current','finalising','archived') then return result||jsonb_build_object('status','BLOCKED','lifecycle_state','OPEN','reason','Only an open Issue can be closed.');end if;
 select id into chosen from public.issue_cover_candidates where issue_id=i.id and status='selected' and public.rollover_cover_candidate_valid(id);
 if chosen is not null then method:='preserved-confirmed-selection';
 elsif exists(select 1 from public.issue_cover_candidates where issue_id=i.id and status='selected') then
  return result||jsonb_build_object('status','AWAITING_COVER','lifecycle_state','AWAITING COVER','reason','The confirmed cover is unavailable or invalid. Restore its artwork before closing.');
 else
  select array_agg(id order by id) into eligible from public.issue_cover_candidates where issue_id=i.id and status='submitted' and public.rollover_cover_candidate_valid(id);
  if coalesce(cardinality(eligible),0)=0 then return result||jsonb_build_object('status','AWAITING_COVER','lifecycle_state','AWAITING COVER','reason','Issue is waiting for a valid submitted cover.');end if;
  if cardinality(eligible)=1 then chosen:=eligible[1];method:='only-eligible-submission';
  else
   with totals as (select c.id,count(v.voter_id) votes from public.issue_cover_candidates c left join public.issue_cover_votes v on v.candidate_id=c.id and v.issue_id=i.id where c.id=any(eligible) group by c.id)
   select array_agg(id order by id) into winners from totals where votes=(select max(votes) from totals);
   if cardinality(winners)=1 then chosen:=winners[1];method:='unique-vote-leader';
   else return result||jsonb_build_object('status','BLOCKED','lifecycle_state','AWAITING COVER','reason','Cover submissions are tied. Confirm a selection in Cover Pool, then retry.');end if;
  end if;
 end if;
 if i.status='archived' and (select payload->>'cover_art' from public.issue_cover_candidates where id=chosen) is distinct from i.cover_art then return result||jsonb_build_object('status','BLOCKED','lifecycle_state','ARCHIVED','reason','An archived Issue can only reconcile its existing official artwork.');end if;
 select * into r from public.issue_rollover where issue_id=i.id;
 return result||jsonb_build_object('status','READY_TO_CLOSE','lifecycle_state',case when r.phase='error' then 'CLOSE FAILED' when i.status='archived' then 'ARCHIVED' else 'READY TO CLOSE' end,'reason',case when r.phase='error' then r.message else 'Submitted cover is ready. Close now or wait for calendar month end.' end,'candidate_id',chosen,'method',method);
end $$;

create function public.close_issue_internal(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; c public.issue_cover_candidates; p jsonb; problems jsonb; state jsonb; method text; step text:='lock-issue'; panel_ids uuid[];
begin
 if not pg_try_advisory_xact_lock(hashtextextended('koma-close-issue:'||target::text,0)) then
  return jsonb_build_object('status','CLOSE_IN_PROGRESS','lifecycle_state','CLOSING','issueId',target,'reason','Issue closure is already in progress. Refresh to check its result.');
 end if;
 begin
  select * into i from public.issues where id=target for update nowait;
 exception when lock_not_available then
  return jsonb_build_object('status','CLOSE_IN_PROGRESS','lifecycle_state','CLOSING','issueId',target,'reason','The Issue is being updated. Retry closure shortly.');
 end;
 state:=public.issue_close_state_internal(target);
 if state->>'status'='ALREADY_ARCHIVED' or i.id is null then return state;end if;
 if state->>'status'<>'READY_TO_CLOSE' then
  insert into public.issue_rollover(issue_id,phase,message) values(i.id,'needs_editorial',state->>'reason') on conflict(issue_id) do update set phase=excluded.phase,message=excluded.message,checked_at=now();
  return state;
 end if;
 begin
  step:='collect-panels';
  perform 1 from public.features f where f.issue_id=i.id and public.feature_is_public(f.id) order by f.id for update nowait;
  select coalesce(array_agg(f.id order by f.id),'{}'::uuid[]) into panel_ids from public.features f where f.issue_id=i.id and public.feature_is_public(f.id);
  select * into c from public.issue_cover_candidates where id=(state->>'candidate_id')::uuid for update;
  method:=state->>'method';
  insert into public.issue_rollover(issue_id) values(i.id) on conflict do nothing;
    step:='attach-cover'; p:=c.payload;
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
    step:='freeze-panels';
    update public.features f set lifecycle_status='archived',finalised_at=coalesce(f.finalised_at,now()),archived_at=coalesce(f.archived_at,now()),updated_at=now() where f.id=any(panel_ids);
    with archived as (
     update public.editorial_documents ed set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid()
     where ed.lifecycle_status='published' and exists(select 1 from public.features f where f.id=ed.feature_id and f.issue_id=i.id and f.lifecycle_status='archived') returning ed.*
    ) insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
      select feature_id,schema_version,working_document,'Archived by Issue close',c.created_by from archived;
    step:='archive-issue';
    update public.issues set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() where id=i.id;
    update public.issue_rollover set phase='archived',message='Archived with submitted cover selected ('||method||').',checked_at=now() where issue_id=i.id;
  update public.issue_cover_audit set details=details||jsonb_build_object('panel_ids',panel_ids,'method',method) where issue_id=i.id and action='archive-validated';
  return public.issue_close_state_internal(i.id)||jsonb_build_object('status','ARCHIVED','reason','Issue archived successfully.','includedPanelCount',cardinality(panel_ids));
 exception when others then
  insert into public.issue_rollover(issue_id,phase,message) values(i.id,'error','Close failed at '||step||' (SQLSTATE '||sqlstate||'). No partial archive was saved. Retry; if it repeats, contact an administrator.')
   on conflict(issue_id) do update set phase='error',message=excluded.message,checked_at=now();
  return jsonb_build_object('status','FAILED','lifecycle_state','CLOSE FAILED','issueId',i.id,'step',step,'reason',(select message from public.issue_rollover where issue_id=i.id));
 end;
end $$;

create function public.close_issue(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 perform public.require_handbook_acceptance();
 return public.close_issue_internal(target);
end $$;
create function public.issue_close_state(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('koma-close-issue:'||target::text,0)) then return jsonb_build_object('issueId',target,'status','CLOSE_IN_PROGRESS','lifecycle_state','CLOSING','reason','Issue closure is already in progress.');end if;
 return public.issue_close_state_internal(target);
end $$;
-- Legacy callers receive a structured instruction rather than guessing or creating an Issue.
create or replace function public.close_current_issue() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 return jsonb_build_object('status','BLOCKED','reason','Refresh and close a specific Issue. An exact Issue ID is required.');
end $$;
create or replace function public.issue_close_preview() returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 select id into target from public.issues where status in ('current','finalising') order by year,month,id limit 1;
 if target is null then select id into target from public.issues where status='archived' order by year desc,month desc,id limit 1;end if;
 return public.issue_close_state(target);
end $$;
create or replace function public.run_issue_rollover() returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; results jsonb:='[]'; state jsonb;
begin
 for i in select * from public.issues where status in ('current','finalising') and ((make_date(year,month,1)+interval '1 month') at time zone 'UTC')<=now() order by year,month,id loop
  state:=public.close_issue_internal(i.id);
  results:=results||jsonb_build_array(state||jsonb_build_object('issue',i.issue_number));
 end loop;
 update public.weekly_drops d set status='published',published_at=d.scheduled_at,updated_at=now() from public.issues parent
 where parent.id=d.issue_id and parent.status='current' and now()>=parent.opens_at and now()<parent.closes_at and d.status='scheduled' and d.scheduled_at<=now() and d.scheduled_at>=parent.opens_at and d.scheduled_at<parent.closes_at;
 return results;
end $$;
revoke all on function public.close_issue_internal(uuid),public.issue_close_state_internal(uuid),public.close_issue(uuid),public.issue_close_state(uuid) from public,anon,authenticated;
grant execute on function public.close_issue(uuid),public.issue_close_state(uuid) to authenticated;

-- Explicit staff action for legacy saved cover work. Merely saving artwork never submits it.
create function public.submit_saved_issue_cover(target uuid,confirmed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; candidate uuid; p jsonb; author uuid;
begin
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 perform public.require_handbook_acceptance();
 if confirmed is distinct from true then raise exception 'Confirm submission of the saved cover';end if;
 select * into i from public.issues where id=target for update;
 if i.id is null or i.status not in ('current','finalising','archived') then raise exception 'Choose an existing Issue';end if;
 select id into candidate from public.issue_cover_candidates where issue_id=i.id and payload->>'cover_art'=i.cover_art and status in ('submitted','selected');
 if candidate is not null then return jsonb_build_object('status','SUBMITTED','candidate_id',candidate);end if;
 if exists(select 1 from public.issue_cover_candidates where issue_id=i.id and status='selected') then raise exception 'An official cover is already selected';end if;
 if i.cover_updated_by is null or (i.cover_updated_by<>auth.uid() and public.open_panel_role()<>'admin') then raise exception 'Only the saved cover author or an Admin may submit it' using errcode='42501';end if;
 author:=i.cover_updated_by;
 if (select count(*) from public.issue_cover_candidates where issue_id=i.id and created_by=author)>=2 then raise exception 'The author already has 2 candidates for this Issue';end if;
 p:=jsonb_build_object('issue_id',i.id::text,'issue_number',i.issue_number::text,'title',i.title,'slug',i.slug,'year',i.year::text,'month',i.month::text,
 'cover_art',i.cover_art,'cover_art_alt',i.cover_art_alt,'cover_art_credit',i.cover_art_credit,'lead_feature_id',coalesce(i.lead_feature_id::text,''),'lead_headline',i.lead_headline,'cover_theme',i.cover_theme,'secondary_cover_lines',i.secondary_cover_lines,'editor_note_teaser',i.editor_note_teaser,'featuring_line',i.featuring_line,'cover_preset',i.cover_preset);
 insert into public.issue_cover_candidates(issue_id,created_by,payload,status,submitted_at) values(i.id,author,p,'submitted',now()) returning id into candidate;
 if not public.rollover_cover_candidate_valid(candidate) then raise exception 'Saved cover needs available artwork, alt text and valid cover copy before submission';end if;
 insert into public.issue_cover_audit(issue_id,actor_id,action,details) values(i.id,auth.uid(),'saved',jsonb_build_object('explicit_submission',candidate,'source','saved-cover','original_author',author));
 return jsonb_build_object('status','SUBMITTED','candidate_id',candidate);
end $$;
revoke all on function public.submit_saved_issue_cover(uuid,boolean) from public,anon,authenticated;
grant execute on function public.submit_saved_issue_cover(uuid,boolean) to authenticated;

-- Freeze exact archive membership; later publication must choose an open Issue.
create function public.guard_archived_issue_membership() returns trigger language plpgsql security definer set search_path='' as $$
declare parent_status text;
begin
 if tg_op='UPDATE' and old.issue_id is distinct from new.issue_id and old.issue_id is not null then
  select status into parent_status from public.issues where id=old.issue_id for key share;
  if parent_status='archived' and old.status='published' then raise exception 'Archived Issue membership is fixed';end if;
 end if;
 if new.issue_id is not null and new.status='published' and new.lifecycle_status not in ('draft','taken_down') and
  (tg_op='INSERT' or old.issue_id is distinct from new.issue_id or old.status<>'published' or old.lifecycle_status in ('draft','taken_down')) then
  select status into parent_status from public.issues where id=new.issue_id for key share;
  if parent_status='archived' then raise exception 'Choose an open Issue before publishing this Panel';end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_archived_issue_membership() from public,anon,authenticated;
create trigger freeze_archived_issue_membership before insert or update of issue_id,status,lifecycle_status on public.features for each row execute function public.guard_archived_issue_membership();
