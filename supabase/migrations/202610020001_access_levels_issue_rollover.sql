-- One access selector, retaining the separate authoritative site role and editorial grants.
create function public.set_member_access_level(target uuid, desired_access text, confirmed boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare p public.profiles; desired_role text; email_address text;
begin
 perform pg_advisory_xact_lock(hashtextextended('koma-admin-access',0));
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 if target=auth.uid() then raise exception 'Ask another administrator to change your access' using errcode='42501';end if;
 if desired_access not in ('member','editor','moderator','admin') or desired_access is null then raise exception 'Choose a valid access level';end if;
 if desired_access<>'member' and confirmed is distinct from true then raise exception 'Confirm elevated access' using errcode='42501';end if;
 select * into p from public.profiles where id=target for update;
 if p.id is null or p.account_status<>'active' then raise exception 'Choose an active member';end if;
 desired_role:=case when desired_access='editor' then 'member' else desired_access end;
 if p.role<>desired_role then perform public.grant_open_panel_role(target,desired_role);end if;
 -- Downgrades revoke only access grants, preserving their audit history and all authored content.
 if desired_access in ('member','editor') then
  update public.editorial_access_grants g set revoked_at=now(),revoked_by=auth.uid(),updated_at=now(),reason='Access level changed to '||desired_access
   where g.user_id=target and g.revoked_at is null and (desired_access='member' or g.access_level='administrator');
 end if;
 if desired_access='editor' then
  select email into email_address from auth.users where id=target;
  perform public.manage_editorial_grant(email_address,true,'Access level changed to Editorial Contributor');
 end if;
end $$;
revoke all on function public.set_member_access_level(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.set_member_access_level(uuid,text,boolean) to authenticated;

-- Private operational state, never added to the public Issue projection.
create table public.issue_rollover (
 issue_id uuid primary key references public.issues(id) on delete cascade,
 phase text not null default 'needs_editorial' check(phase in ('needs_editorial','ready','paused','waiting','archived','error')),
 message text not null default 'Confirm the official cover and published lead panel.',
 cover_snapshot jsonb, confirmed_by uuid references public.profiles(id), confirmed_at timestamptz,
 checked_at timestamptz not null default now()
);
alter table public.issue_rollover enable row level security;
revoke all on public.issue_rollover from public,anon,authenticated;
grant select on public.issue_rollover to authenticated;
create policy issue_rollover_staff on public.issue_rollover for select to authenticated using(public.cover_committee_access() and public.has_current_handbook_acceptance());

create function public.issue_rollover_cover(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('identity',jsonb_build_array(i.id,i.issue_number,i.slug,i.title,i.year,i.month,extract(epoch from i.opens_at),extract(epoch from i.closes_at)),
 'cover',jsonb_build_array(i.cover_art,i.cover_art_alt,i.cover_art_credit,i.lead_feature_id,i.lead_headline,i.cover_theme,i.secondary_cover_lines,i.editor_note_teaser,i.featuring_line,i.cover_preset)) from public.issues i where i.id=target
$$;
create function public.issue_rollover_errors(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.issue_cover_errors(i.id) || case
 when i.cover_art like 'cover-pool/%' and not exists(select 1 from public.issue_cover_candidates c where c.issue_id=i.id and c.status='selected' and c.payload->>'cover_art'=i.cover_art) then '["Confirm the official Cover Pool selection."]'::jsonb
 when i.cover_art like 'editorial/%' and not exists(select 1 from storage.objects o where o.bucket_id='editorial-feature-images' and o.name=i.cover_art) then '["Official cover artwork is unavailable."]'::jsonb
 else '[]'::jsonb end from public.issues i where i.id=target
$$;
create function public.confirm_issue_rollover(target uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare i public.issues; problems jsonb;
begin
 perform public.require_handbook_acceptance();
 if not public.cover_committee_access() then raise exception 'Moderator access required' using errcode='42501';end if;
 select * into i from public.issues where id=target for update;
 if i.id is null or i.status not in ('current','finalising') then raise exception 'Choose a current or finalising Issue';end if;
 if enabled is null then raise exception 'Choose whether rollover is enabled';end if;
 if enabled then
  problems:=public.issue_rollover_errors(target);
  if jsonb_array_length(problems)>0 then raise exception 'Editorial completion required: %',problems->>0;end if;
 end if;
 insert into public.issue_rollover(issue_id,phase,message,cover_snapshot,confirmed_by,confirmed_at)
 values(target,case when enabled then 'ready' else 'paused' end,case when enabled then 'Official cover confirmed. Rollover will run after the Issue deadline and calendar month end (UTC).' else 'Automatic rollover paused by editorial.' end,
 case when enabled then public.issue_rollover_cover(target) end,case when enabled then auth.uid() end,case when enabled then now() end)
 on conflict(issue_id) do update set phase=excluded.phase,message=excluded.message,cover_snapshot=excluded.cover_snapshot,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,checked_at=now();
end $$;

-- Retain the existing archive guard/audit, including service-triggered archive attribution.
create or replace function public.enforce_issue_cover_before_archive() returns trigger language plpgsql security definer set search_path='' as $$
declare problems jsonb; actor uuid;
begin
 if new.status='archived' and old.status<>'archived' then
  problems:=public.issue_cover_errors(new.id);
  if jsonb_array_length(problems)>0 then raise exception 'Cover is not ready: %',problems->>0;end if;
  actor:=auth.uid();
  if actor is null then select confirmed_by into actor from public.issue_rollover where issue_id=new.id and cover_snapshot=public.issue_rollover_cover(new.id);end if;
  if actor is null then raise exception 'Confirmed editorial cover required';end if;
  insert into public.issue_cover_audit(issue_id,actor_id,action) values(new.id,actor,'archive-validated');
 end if;
 return new;
end $$;

-- Service-only, retryable reconciliation. No latest-panel/month heuristic and no invented Issues/drops/covers.
create function public.run_issue_rollover() returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.issues; r public.issue_rollover; problems jsonb; results jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('koma-issue-rollover',0));
 for i in select * from public.issues where status in ('current','finalising') and closes_at<=now()
 and ((make_date(year,month,1)+interval '1 month') at time zone 'UTC')<=now() order by closes_at,id for update loop
  begin
   select * into r from public.issue_rollover where issue_id=i.id;
   if r.phase='paused' then continue;end if;
   update public.issues set status='finalising',updated_at=now() where id=i.id and status='current';
   insert into public.issue_rollover(issue_id) values(i.id) on conflict do nothing;
   problems:=public.issue_rollover_errors(i.id);
   if r.confirmed_by is null or r.cover_snapshot is distinct from public.issue_rollover_cover(i.id) then problems:=problems||'["Confirm the current official cover and Issue dates."]'::jsonb;end if;
   if r.confirmed_by is not null and not exists(select 1 from public.profiles where id=r.confirmed_by and account_status='active' and role in ('moderator','admin')) then problems:=problems||'["An active Moderator or Admin must reconfirm the cover."]'::jsonb;end if;
   if jsonb_array_length(problems)>0 then
    update public.issue_rollover set phase='needs_editorial',message=concat_ws(' ', 'Editorial completion required:',(select string_agg(value,' ') from jsonb_array_elements_text(problems))),checked_at=now() where issue_id=i.id;
   elsif exists(select 1 from public.features where issue_id=i.id and status='published' and lifecycle_status not in ('draft','taken_down','archived') and deadline_override>now()) then
    update public.issue_rollover set phase='waiting',message='Waiting for an explicit Panel deadline extension.',checked_at=now() where issue_id=i.id;
   else
    -- Archive exactly this Issue's already-public membership. Never move a Panel from another Issue.
    update public.features f set lifecycle_status='archived',finalised_at=coalesce(f.finalised_at,now()),archived_at=coalesce(f.archived_at,now()),updated_at=now()
     where f.issue_id=i.id and public.feature_is_public(f.id);
    with archived as (
     update public.editorial_documents ed set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid()
     where ed.lifecycle_status='published' and exists(select 1 from public.features f where f.id=ed.feature_id and f.issue_id=i.id and f.lifecycle_status='archived') returning ed.*
    ) insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
      select feature_id,schema_version,working_document,'Archived by monthly Issue rollover',r.confirmed_by from archived;
    update public.issues set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() where id=i.id;
    update public.issue_rollover set phase='archived',message='Archived with the confirmed official cover.',checked_at=now() where issue_id=i.id;
   end if;
  exception when others then
   -- A failed Issue rolls back independently; keep a visible retry state and continue other Issues.
   insert into public.issue_rollover(issue_id,phase,message) values(i.id,'error','Rollover failed; editorial review required. SQLSTATE '||sqlstate)
   on conflict(issue_id) do update set phase='error',message=excluded.message,checked_at=now();
  end;
  results:=results||jsonb_build_array((select jsonb_build_object('issue',i.issue_number,'phase',phase) from public.issue_rollover where issue_id=i.id));
 end loop;
 -- Existing weekly-drop scheduling rules: nothing late, draft or held is published by rollover.
 update public.weekly_drops d set status='published',published_at=d.scheduled_at,updated_at=now() from public.issues parent
 where parent.id=d.issue_id and parent.status='current' and now()>=parent.opens_at and now()<parent.closes_at and d.status='scheduled' and d.scheduled_at<=now() and d.scheduled_at>=parent.opens_at and d.scheduled_at<parent.closes_at;
 return results;
end $$;
revoke all on function public.issue_rollover_cover(uuid),public.issue_rollover_errors(uuid),public.confirm_issue_rollover(uuid,boolean),public.run_issue_rollover() from public,anon,authenticated;
grant execute on function public.confirm_issue_rollover(uuid,boolean) to authenticated;
grant execute on function public.run_issue_rollover() to service_role;
