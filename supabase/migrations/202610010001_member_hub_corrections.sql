-- Private pre-review corrections only; public projections/permissions remain unchanged.
alter table public.contributions add column edit_version bigint not null default 1;
create function public.bump_contribution_edit_version() returns trigger language plpgsql set search_path='' as $$begin new.edit_version:=old.edit_version+1;return new;end $$;
create trigger contribution_edit_version before update on public.contributions for each row execute function public.bump_contribution_edit_version();
create table public.contribution_edit_history(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contributions(id),author_id uuid not null references public.profiles(id),prior_version bigint not null,snapshot jsonb not null,created_at timestamptz not null default now(),unique(contribution_id,prior_version));
alter table public.contribution_edit_history enable row level security;
revoke all on public.contribution_edit_history from public,anon,authenticated;
grant select on public.contribution_edit_history to authenticated;
create policy contribution_history_private on public.contribution_edit_history for select to authenticated using(public.has_current_handbook_acceptance() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active') and (author_id=auth.uid() or public.open_panel_role() in ('moderator','admin')));
-- Called only by the existing idempotent submission wrapper. Lock the same row as review.
create or replace function public.save_contribution_before_continuity(payload jsonb,contribution_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contributions; result uuid;
begin
 perform public.require_handbook_acceptance();
 if contribution_id is not null then
 select * into c from public.contributions where id=contribution_id for update;
 if c.id is null or c.author_id<>auth.uid() or c.withdrawn_at is not null or c.status not in ('Submitted','Changes Requested') or c.incorporated_at is not null or exists(select 1 from public.published_additions where published_additions.contribution_id=c.id) then raise exception 'Submission is under review or already incorporated. Request an editorial correction.' using errcode='42501';end if;
 if payload->>'expected_edit_version' is distinct from c.edit_version::text then raise exception 'Submission changed. Reload the current version; your local correction is retained.' using errcode='P4090';end if;
 insert into public.contribution_edit_history(contribution_id,author_id,prior_version,snapshot) values(c.id,c.author_id,c.edit_version,to_jsonb(c));
 end if;
 if contribution_id is null then return public.save_contribution_before_four_eyes(payload,null);end if;
 -- Correcting an existing pending submission does not reopen the window for new submissions.
 if not public.feature_is_public(c.feature_id) then raise exception 'Panel unavailable' using errcode='42501';end if;
 if coalesce((payload->>'publication_consent')::boolean,false) is not true or coalesce(payload->>'public_credit','') not in ('Anonymous Panelist','Display name','Pen name') then raise exception 'Publication consent and credit choice are required' using errcode='42501';end if;
 result:=public.save_contribution_before_lifecycle(payload,contribution_id);
 update public.contributions set reviewed_at=null,moderator_id=null,moderator_note=null,public_credit=payload->>'public_credit',publication_consent=true where id=result;
 return result;
end $$;
revoke all on function public.bump_contribution_edit_version(),public.save_contribution_before_continuity(jsonb,uuid) from public,anon,authenticated;
create or replace function public.save_workshop_draft(draft_id uuid,target_feature uuid,expected_version integer,content jsonb,target_contribution uuid default null) returns public.workshop_drafts
language plpgsql security definer set search_path='' as $$
declare d public.workshop_drafts;
begin
 perform public.require_handbook_acceptance();
 if draft_id is null or expected_version is null or expected_version<0 or jsonb_typeof(content) is distinct from 'object' then raise exception 'Invalid draft'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,3));
 if not public.feature_is_public(target_feature) then raise exception 'Panel unavailable' using errcode='42501'; end if;
 if target_contribution is not null and not exists(select 1 from public.workshop_drafts where id=draft_id and user_id=auth.uid() and payload=content and submitted_contribution_id is not null) and not exists(select 1 from public.contributions where id=target_contribution and author_id=auth.uid() and feature_id=target_feature and status in ('Submitted','Changes Requested') and incorporated_at is null and edit_version::text=content->>'expected_edit_version' and withdrawn_at is null) then raise exception 'Submission changed or is under review. Reload its current state; your writing is retained' using errcode='42501'; end if;
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
-- Review must name the version actually shown, not whichever version happens to be current.
create function public.open_panel_review_inbox_current() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('edit_version',c.edit_version) order by r.updated_at,r.contribution_id),'[]'::jsonb) from public.open_panel_review_inbox() r join public.contributions c on c.id=r.contribution_id
$$;
create function public.moderate_contribution_current(target uuid,expected_version bigint,decision text,note text default '') returns void language plpgsql security definer set search_path='' as $$
declare c public.contributions;
begin
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501';end if;
 select * into c from public.contributions where id=target for update;
 if c.id is null or expected_version is distinct from c.edit_version then raise exception 'Submission changed. Reload it before recording your review.' using errcode='P4090';end if;
 perform public.moderate_contribution(target,decision,'','',note);
end $$;
revoke all on function public.moderate_contribution(uuid,text,text,text,text),public.open_panel_review_inbox_current(),public.moderate_contribution_current(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.open_panel_review_inbox_current(),public.moderate_contribution_current(uuid,bigint,text,text) to authenticated;
