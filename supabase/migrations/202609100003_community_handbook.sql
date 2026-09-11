-- Versioned, immutable source-controlled cultural handbook; not a legal-policy acceptance.
create table public.handbook_versions (
 id uuid primary key default gen_random_uuid(), identifier text not null unique check(identifier ~ '^[a-z0-9-]+$'),label text not null check(length(label) between 1 and 150),
 content text not null check(length(content) between 100 and 50000),
 content_hash text not null default '',
 acceptance_statement text not null,statement_version text not null,
 published_at timestamptz not null default now(),active boolean not null default false,created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index one_active_handbook on public.handbook_versions((active)) where active;
create function public.handbook_content_hash() returns trigger language plpgsql set search_path='' as $$begin new.content_hash:=encode(sha256(convert_to(new.content,'UTF8')),'hex');return new;end $$;
create trigger handbook_content_hash before insert or update of content on public.handbook_versions for each row execute function public.handbook_content_hash();
create table public.handbook_acceptances (
 user_id uuid not null references public.profiles(id),handbook_version_id uuid not null references public.handbook_versions(id),
 accepted_at timestamptz not null default now(),statement_version text not null,
 primary key(user_id,handbook_version_id)
);
create table public.handbook_version_audit (
 id uuid primary key default gen_random_uuid(),version_id uuid not null references public.handbook_versions(id),actor_id uuid references public.profiles(id),action text not null,created_at timestamptz not null default now()
);
alter table public.handbook_versions enable row level security;
alter table public.handbook_acceptances enable row level security;
alter table public.handbook_version_audit enable row level security;
create policy handbook_read on public.handbook_versions for select using(active or public.open_panel_role()='admin' or exists(select 1 from public.handbook_acceptances a where a.handbook_version_id=id and a.user_id=auth.uid()));
create policy acceptance_read on public.handbook_acceptances for select to authenticated using(user_id=auth.uid());
create policy handbook_audit_admin on public.handbook_version_audit for select to authenticated using(public.open_panel_role()='admin');
revoke all on public.handbook_versions,public.handbook_acceptances,public.handbook_version_audit from anon,authenticated;
grant select on public.handbook_versions to anon,authenticated;
grant select on public.handbook_acceptances,public.handbook_version_audit to authenticated;
create function public.has_current_handbook_acceptance() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.handbook_versions v join public.handbook_acceptances a on a.handbook_version_id=v.id where v.active and a.user_id=auth.uid() and a.statement_version=v.statement_version) $$;
create function public.require_handbook_acceptance() returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serialize acceptance/participation with activation, even for direct RPC callers.
 perform pg_advisory_xact_lock(188504,1);
 if not public.has_current_handbook_acceptance() then raise exception 'Accept the current community handbook before participating' using errcode='42501';end if;
end $$;
create function public.accept_handbook(target uuid,expected_hash text,statement text,consent boolean) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v public.handbook_versions;accepted timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in before accepting the handbook' using errcode='42501';end if;
 if consent is distinct from true then raise exception 'Explicit acceptance of the compact is required';end if;
 perform pg_advisory_xact_lock(188504,1);
 select * into v from public.handbook_versions where active and id=target;
 if v.id is null or v.content_hash is distinct from expected_hash or v.statement_version is distinct from statement then raise exception 'The active handbook changed. Read the current version before accepting.';end if;
 insert into public.handbook_acceptances(user_id,handbook_version_id,statement_version) values(auth.uid(),v.id,v.statement_version) on conflict(user_id,handbook_version_id) do nothing;
 select accepted_at into accepted from public.handbook_acceptances where user_id=auth.uid() and handbook_version_id=v.id;
 return accepted;
end $$;
create function public.prepare_handbook_version(version_identifier text,version_label text,exact_content text,compact text,compact_version text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 insert into public.handbook_versions(identifier,label,content,acceptance_statement,statement_version,created_by) values(version_identifier,version_label,exact_content,compact,compact_version,auth.uid()) returning id into result;
 insert into public.handbook_version_audit(version_id,actor_id,action) values(result,auth.uid(),'Prepared');return result;
end $$;
create function public.activate_handbook_version(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(188504,1);
 if not exists(select 1 from public.handbook_versions where id=target) then raise exception 'Prepared handbook version not found';end if;
 if exists(select 1 from public.handbook_versions where id=target and active) then return;end if;
 update public.handbook_versions set active=false,updated_at=now() where active;
 update public.handbook_versions set active=true,updated_at=now() where id=target;
 insert into public.handbook_version_audit(version_id,actor_id,action) values(target,auth.uid(),'Activated');
end $$;
create function public.retire_handbook_version(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(188504,1);
 update public.handbook_versions set active=false,updated_at=now() where id=target and active;
 if found then insert into public.handbook_version_audit(version_id,actor_id,action) values(target,auth.uid(),'Retired');end if;
end $$;
create function public.handbook_acceptance_counts() returns table(version_id uuid,acceptance_count bigint) language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 return query select v.id,count(a.user_id) from public.handbook_versions v left join public.handbook_acceptances a on a.handbook_version_id=v.id group by v.id;
end $$;
revoke all on function public.has_current_handbook_acceptance(),public.require_handbook_acceptance(),public.accept_handbook(uuid,text,text,boolean),public.prepare_handbook_version(text,text,text,text,text),public.activate_handbook_version(uuid),public.retire_handbook_version(uuid),public.handbook_acceptance_counts() from public,anon,authenticated;
grant execute on function public.has_current_handbook_acceptance() to anon,authenticated;
grant execute on function public.accept_handbook(uuid,text,text,boolean),public.prepare_handbook_version(text,text,text,text,text),public.activate_handbook_version(uuid),public.retire_handbook_version(uuid),public.handbook_acceptance_counts() to authenticated;

insert into public.handbook_versions(identifier,label,content,acceptance_statement,statement_version,active) values(
$approved$handbook-2026-09-v1$approved$,
$approved$Community handbook · Version 1$approved$,
$approved$# WELCOME TO INK//:PLAY

A human-edited home for games, anime, manga and the culture surrounding them.

This is a place to read deeply, share what you know and help create something worth keeping.

## THE PANEL

Every feature begins with an editorial point of view.

While its Open Panel is active, the community can add:

* knowledge;
* experience;
* corrections;
* sources;
* screenshots;
* strategies;
* thoughtful disagreement;
* genuinely useful questions.

The strongest contributions become part of the finished article, with credit.

You are not posting beneath the work.

**You are helping build it.**

## HOW WE MOVE

### Bring something to the panel

Curiosity is enough to begin. Experience, evidence and thoughtful questions make the work stronger.

### Critique ideas, not people

Disagreement belongs here. Hostility, humiliation and pile-ons do not.

### Credit the source

Artists, writers, players and contributors deserve attribution. Say where material came from and never present somebody else’s work as your own.

### Enthusiasm is not embarrassing

People are allowed to care deeply about the things they love. Sincerity is welcome here.

### Expertise is for sharing

Knowing more does not make someone more important. Help newcomers enter the conversation.

### Be human

Do not impersonate people, manufacture support or use automated accounts to imitate community participation. Disclose meaningful use of generated material.

### Leave the panel better

Before submitting, ask:

> Does this add knowledge, clarity, perspective or joy?

## WHAT INK//:PLAY PROMISES

We will not build the community around:

* rage-driven recommendations;
* infinite scrolling;
* public popularity contests;
* purchased influence;
* covert advertising;
* uncredited generated content;
* selling behavioural data;
* deliberately addictive engagement tricks.

Moderation decisions will be made by accountable people. Contributors can ask for explanations and appeal significant decisions.

## THE PUBLISHING RHYTHM

New panels arrive every week.

Weekly drops become a monthly issue.

Open Panels close when the issue ends.

The final edition enters the archive with its revisions and contributors preserved.

**Discord is where we talk.
INK//:PLAY is where we remember.**

## PROTECT THE SPACE

Do not share another person’s private information.

Do not pressure anyone into private conversations.

Do not post harassment, hate, sexualised material involving young people, threats or exploitative content.

Report anything that makes the community unsafe. Asking for help will never count against you.

## YOUR MARK

INK//:PLAY does not measure people by follower counts or how loudly they post.

Contribution is recognised through the work:

* Founding Panelist
* Published Contributor
* Guide Builder
* Source Finder
* Archivist
* Panel Editor

The goal is not to win the conversation.

It is to create an issue we are proud to put our names on.

# LEAVE THE PANEL BETTER THAN YOU FOUND IT.
$approved$,
$approved$I will treat people with respect, credit the work of others, disclose generated material and leave each panel better than I found it.$approved$,
$approved$compact-v1$approved$,true);

alter function public.save_contribution(jsonb,uuid) rename to save_contribution_before_handbook;
revoke all on function public.save_contribution_before_handbook(jsonb,uuid) from public,anon,authenticated;
create function public.save_contribution(payload jsonb,contribution_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); return public.save_contribution_before_handbook(payload,contribution_id); end $$;
revoke all on function public.save_contribution(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid) to authenticated;

alter function public.withdraw_contribution(uuid) rename to withdraw_contribution_before_handbook;
revoke all on function public.withdraw_contribution_before_handbook(uuid) from public,anon,authenticated;
create function public.withdraw_contribution(target uuid) returns void language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); perform public.withdraw_contribution_before_handbook(target); end $$;
revoke all on function public.withdraw_contribution(uuid) from public,anon,authenticated;
grant execute on function public.withdraw_contribution(uuid) to authenticated;

alter function public.moderate_contribution(uuid,text,text,text,text) rename to moderate_contribution_before_handbook;
revoke all on function public.moderate_contribution_before_handbook(uuid,text,text,text,text) from public,anon,authenticated;
create function public.moderate_contribution(target uuid,decision text,published_heading text default '',published_body text default '',note text default '') returns void language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); perform public.moderate_contribution_before_handbook(target,decision,published_heading,published_body,note); end $$;
revoke all on function public.moderate_contribution(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.moderate_contribution(uuid,text,text,text,text) to authenticated;

alter function public.submit_correction(uuid,text,text,text) rename to submit_correction_before_handbook;
revoke all on function public.submit_correction_before_handbook(uuid,text,text,text) from public,anon,authenticated;
create function public.submit_correction(target uuid,report_kind text,report_body text,source text default '') returns uuid language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); return public.submit_correction_before_handbook(target,report_kind,report_body,source); end $$;
revoke all on function public.submit_correction(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_correction(uuid,text,text,text) to authenticated;

alter function public.review_correction(uuid,text,text) rename to review_correction_before_handbook;
revoke all on function public.review_correction_before_handbook(uuid,text,text) from public,anon,authenticated;
create function public.review_correction(target uuid,decision text,note text) returns void language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); perform public.review_correction_before_handbook(target,decision,note); end $$;
revoke all on function public.review_correction(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_correction(uuid,text,text) to authenticated;

alter function public.grant_open_panel_role(uuid,text) rename to grant_open_panel_role_before_handbook;
revoke all on function public.grant_open_panel_role_before_handbook(uuid,text) from public,anon,authenticated;
create function public.grant_open_panel_role(target uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); perform public.grant_open_panel_role_before_handbook(target,new_role); end $$;
revoke all on function public.grant_open_panel_role(uuid,text) from public,anon,authenticated;
grant execute on function public.grant_open_panel_role(uuid,text) to authenticated;

alter function public.manage_publication(text,jsonb) rename to manage_publication_before_handbook;
revoke all on function public.manage_publication_before_handbook(text,jsonb) from public,anon,authenticated;
create function public.manage_publication(kind text,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); return public.manage_publication_before_handbook(kind,payload); end $$;
revoke all on function public.manage_publication(text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_publication(text,jsonb) to authenticated;

alter function public.reconcile_publication() rename to reconcile_publication_before_handbook;
revoke all on function public.reconcile_publication_before_handbook() from public,anon,authenticated;
create function public.reconcile_publication() returns void language plpgsql security definer set search_path='' as $$begin perform public.require_handbook_acceptance(); perform public.reconcile_publication_before_handbook(); end $$;
revoke all on function public.reconcile_publication() from public,anon,authenticated;
grant execute on function public.reconcile_publication() to authenticated;

-- Workshop reads and direct Storage API uploads are protected, too.
drop policy contribution_read on public.contributions;
create policy contribution_read on public.contributions for select to authenticated using(public.has_current_handbook_acceptance() and (author_id=auth.uid() or public.open_panel_role() in ('moderator','admin')));
drop policy screenshot_upload on storage.objects;
create policy screenshot_upload on storage.objects for insert to authenticated with check(public.has_current_handbook_acceptance() and bucket_id='open-panel-screenshots' and (storage.foldername(name))[1]=auth.uid()::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$');
