-- Private continuity only. Existing review and publication functions remain authoritative.
create table public.workshop_drafts (
 id uuid primary key, user_id uuid not null references public.profiles(id), feature_id uuid not null references public.features(id),
 revision_target uuid references public.contributions(id), payload jsonb not null default '{}'::jsonb,
 version integer not null default 1, updated_at timestamptz not null default now(),
 submitted_contribution_id uuid references public.contributions(id),
 check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=20000)
);
create index workshop_drafts_owner on public.workshop_drafts(user_id,updated_at desc);
create table public.workshop_submission_receipts (
 user_id uuid not null references public.profiles(id), request_key uuid not null,
 payload jsonb not null, revision_target uuid, contribution_id uuid not null references public.contributions(id),
 created_at timestamptz not null default now(), primary key(user_id,request_key)
);
create table public.saved_features (
 user_id uuid not null references public.profiles(id), feature_id uuid not null references public.features(id),
 created_at timestamptz not null default now(), primary key(user_id,feature_id)
);
alter table public.workshop_drafts enable row level security;
alter table public.workshop_submission_receipts enable row level security;
alter table public.saved_features enable row level security;
revoke all on public.workshop_drafts,public.workshop_submission_receipts,public.saved_features from public,anon,authenticated;
grant select on public.workshop_drafts,public.saved_features to authenticated;
create policy workshop_draft_owner on public.workshop_drafts for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active'));
create policy saved_feature_owner on public.saved_features for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active'));

alter function public.save_contribution(jsonb,uuid) rename to save_contribution_before_continuity;
revoke all on function public.save_contribution_before_continuity(jsonb,uuid) from public,anon,authenticated;
create function public.save_contribution(payload jsonb,contribution_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare k uuid; clean jsonb:=payload-'request_key'; receipt public.workshop_submission_receipts; result uuid;
begin
 perform public.require_handbook_acceptance();
 -- Older clients also receive atomic exact-payload deduplication.
 k:=coalesce(nullif(payload->>'request_key','')::uuid,md5(clean::text||coalesce(contribution_id::text,''))::uuid);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||k::text,0));
 select * into receipt from public.workshop_submission_receipts r where r.user_id=auth.uid() and r.request_key=k;
 if found then
  if receipt.payload<>clean or receipt.revision_target is distinct from contribution_id then raise exception 'This submission was already sent with different content. Recover your latest writing as a new draft.' using errcode='P4090'; end if;
  return receipt.contribution_id;
 end if;
 result:=public.save_contribution_before_continuity(clean,contribution_id);
 insert into public.workshop_submission_receipts(user_id,request_key,payload,revision_target,contribution_id) values(auth.uid(),k,clean,contribution_id,result);
 return result;
end $$;

create function public.save_workshop_draft(draft_id uuid,target_feature uuid,expected_version integer,content jsonb,target_contribution uuid default null) returns public.workshop_drafts
language plpgsql security definer set search_path='' as $$
declare d public.workshop_drafts;
begin
 perform public.require_handbook_acceptance();
 if draft_id is null or expected_version is null or expected_version<0 or jsonb_typeof(content) is distinct from 'object' then raise exception 'Invalid draft'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,3));
 if not public.feature_is_public(target_feature) then raise exception 'Panel unavailable' using errcode='42501'; end if;
 if target_contribution is not null and not exists(select 1 from public.workshop_drafts where id=draft_id and user_id=auth.uid() and payload=content and submitted_contribution_id is not null) and not exists(select 1 from public.contributions where id=target_contribution and author_id=auth.uid() and feature_id=target_feature and status='Changes Requested' and withdrawn_at is null) then raise exception 'Only your returned proposal can be revised' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(draft_id::text,1));
 select * into d from public.workshop_drafts where id=draft_id for update;
 if found then
  if d.user_id<>auth.uid() or d.feature_id<>target_feature or d.revision_target is distinct from target_contribution then raise exception 'Draft unavailable' using errcode='42501'; end if;
  if d.payload=content then return d; end if;
  if d.submitted_contribution_id is not null then raise exception 'This draft was submitted. Keep any further writing as a new draft.' using errcode='P4090'; end if;
  if d.version<>expected_version then raise exception 'Newer draft exists. Your local writing is preserved.' using errcode='P4090'; end if;
  update public.workshop_drafts set payload=content,version=version+1,updated_at=now() where id=draft_id returning * into d;
 else
  if expected_version<>0 then raise exception 'Draft version unavailable' using errcode='P4090'; end if;
  if (select count(*) from public.workshop_drafts where user_id=auth.uid() and submitted_contribution_id is null)>=100 then raise exception 'Draft limit reached. Finish an existing draft first.'; end if;
  insert into public.workshop_drafts(id,user_id,feature_id,revision_target,payload) values(draft_id,auth.uid(),target_feature,target_contribution,content) returning * into d;
 end if;
 return d;
end $$;
create function public.submit_workshop_draft(draft_id uuid,expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare d public.workshop_drafts; result uuid;
begin
 perform public.require_handbook_acceptance();
 select * into d from public.workshop_drafts where id=draft_id and user_id=auth.uid() for update;
 if not found then raise exception 'Draft unavailable' using errcode='42501'; end if;
 if d.version is distinct from expected_version then raise exception 'Newer draft exists' using errcode='P4090'; end if;
 if d.submitted_contribution_id is not null then return d.submitted_contribution_id; end if;
 result:=public.save_contribution(d.payload||jsonb_build_object('feature_id',d.feature_id,'request_key',d.id),d.revision_target);
 update public.workshop_drafts set submitted_contribution_id=result,updated_at=now() where id=d.id;
 return result;
end $$;
create function public.set_feature_saved(target uuid,save boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_handbook_acceptance();
 if save then
  if not public.feature_is_public(target) then raise exception 'Panel unavailable' using errcode='42501'; end if;
  insert into public.saved_features(user_id,feature_id) values(auth.uid(),target) on conflict do nothing;
 else delete from public.saved_features where user_id=auth.uid() and feature_id=target; end if;
 return save;
end $$;
create function public.my_contribution_publication() returns table(contribution_id uuid,published boolean,cited boolean)
language sql stable security definer set search_path='' as $$
 select c.id,
 exists(select 1 from public.published_additions a where a.contribution_id=c.id and public.feature_is_public(a.feature_id)),
 exists(select 1 from public.panel_citations pc where pc.contribution_id=c.id and public.feature_is_public(pc.feature_id))
 from public.contributions c where c.author_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active')
$$;
-- Keep reports in the existing private moderation system, including on open panels.
create or replace function public.submit_correction(target uuid,report_kind text,report_body text,source text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.require_handbook_acceptance();
 if not public.feature_is_public(target) then raise exception 'Panel unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,2));
 select id into result from public.correction_reports where reporter_id=auth.uid() and feature_id=target and kind=report_kind and body=trim(report_body) and source_url=source and created_at>now()-interval '5 minutes' order by created_at desc limit 1;
 if result is not null then return result; end if;
 if (select count(*) from public.correction_reports where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=3 then raise exception 'Limit reached: three private reports per hour'; end if;
 insert into public.correction_reports(feature_id,reporter_id,kind,body,source_url) values(target,auth.uid(),report_kind,trim(report_body),source) returning id into result;
 insert into public.correction_audit(report_id,actor_id,new_status) values(result,auth.uid(),'Submitted');
 return result;
end $$;
revoke all on function public.save_contribution(jsonb,uuid),public.save_workshop_draft(uuid,uuid,integer,jsonb,uuid),public.submit_workshop_draft(uuid,integer),public.set_feature_saved(uuid,boolean),public.my_contribution_publication() from public,anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid),public.save_workshop_draft(uuid,uuid,integer,jsonb,uuid),public.submit_workshop_draft(uuid,integer),public.set_feature_saved(uuid,boolean),public.my_contribution_publication() to authenticated;

-- Suspended accounts cannot read reports or their moderation audit.
alter policy corrections_read on public.correction_reports using (
 exists(select 1 from public.profiles where id=auth.uid() and account_status='active')
 and (reporter_id=auth.uid() or public.open_panel_role() in ('moderator','admin'))
);
alter policy corrections_audit_read on public.correction_audit using (
 exists(select 1 from public.profiles where id=auth.uid() and account_status='active')
 and (public.open_panel_role() in ('moderator','admin') or exists(select 1 from public.correction_reports r where r.id=report_id and r.reporter_id=auth.uid()))
);
