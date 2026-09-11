-- Open Panel alpha. All writes use narrowly scoped, identity-checked functions.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80), avatar_url text,
 role text not null default 'member' check(role in ('member','contributor','moderator','admin')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.create_open_panel_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',80),''),'Reader')); return new; end $$;
create trigger open_panel_profile after insert on auth.users for each row execute function public.create_open_panel_profile();
insert into public.profiles(id,display_name) select id,coalesce(nullif(left(raw_user_meta_data->>'display_name',80),''),'Reader') from auth.users on conflict do nothing;
create function public.open_panel_role() returns text language sql stable security definer set search_path = '' as $$ select role from public.profiles where id=auth.uid() $$;
create view public.public_profiles with (security_barrier=true) as select id,display_name,avatar_url from public.profiles;
create table public.features (
 id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null,
 status text not null default 'published' check(status in ('draft','published','archived')),
 current_revision integer not null default 1, published_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.contributions (
 id uuid primary key default gen_random_uuid(), feature_id uuid not null references public.features(id), author_id uuid not null references public.profiles(id),
 type text not null check(type in ('Tip','Correction','Strategy','Counterpoint','Screenshot','Source','Example','Recommendation','Timeline','Personal Experience','Question')),
 target_section text not null check(target_section in ('Overview','Choosing a fighter','Assists','Practice','Sources')),
 title text not null check(length(trim(title)) between 4 and 120), body text not null check(length(trim(body)) between 20 and 8000),
 screenshot_path text not null default '', media_url text not null default '', source_url text not null default '',
 status text not null default 'Submitted' check(status in ('Submitted','In Review','Changes Requested','Accepted','Rejected')),
 moderator_note text, moderator_id uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), reviewed_at timestamptz, withdrawn_at timestamptz,
 check(length(source_url)<=2000 and (source_url='' or source_url ~ '^https://[^/@[:space:]]+([/:?#][^[:space:]]*)?$')),
 check(length(media_url)<=2000 and (media_url='' or media_url ~ '^https://(www\.)?(youtube\.com|youtu\.be|twitch\.tv|clips\.twitch\.tv)([/?#][^[:space:]]*)?$')),
 check(screenshot_path='' or screenshot_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
 check(type<>'Screenshot' or screenshot_path<>'')
);
create index contributions_queue on public.contributions(feature_id,status,created_at desc);
create index contributions_author on public.contributions(author_id);
create table public.published_additions (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null unique references public.contributions(id), feature_id uuid not null references public.features(id),
 heading text not null check(length(trim(heading)) between 4 and 120), body text not null check(length(trim(body)) between 20 and 8000), target_section text not null,
 display_order integer not null, contributor_id uuid not null references public.profiles(id), publishing_moderator uuid not null references public.profiles(id),
 screenshot_path text not null default '', media_url text not null default '', source_url text not null default '',
 published_at timestamptz not null default now(), revision_number integer not null,
 unique(feature_id,revision_number)
);
create table public.revisions (
 id uuid primary key default gen_random_uuid(), feature_id uuid not null references public.features(id), revision_number integer not null,
 summary text not null, contributor_ids uuid[] not null default '{}', created_at timestamptz not null default now(), unique(feature_id,revision_number)
);
create table public.moderation_audit (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null references public.contributions(id), action text not null,
 previous_status text, new_status text not null, actor_id uuid not null references public.profiles(id), note text, created_at timestamptz not null default now()
);
create table public.role_audit (id uuid primary key default gen_random_uuid(),target_id uuid not null references public.profiles(id), actor_id uuid not null references public.profiles(id), previous_role text not null,new_role text not null,created_at timestamptz not null default now());
alter table public.profiles enable row level security;
alter table public.features enable row level security;
alter table public.contributions enable row level security;
alter table public.published_additions enable row level security;
alter table public.revisions enable row level security;
alter table public.moderation_audit enable row level security;
alter table public.role_audit enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.open_panel_role() in ('moderator','admin'));
create policy feature_read on public.features for select using(status='published' or public.open_panel_role() in ('moderator','admin'));
create policy contribution_read on public.contributions for select to authenticated using(author_id=auth.uid() or public.open_panel_role() in ('moderator','admin'));
create policy addition_read on public.published_additions for select using(exists(select 1 from public.features f where f.id=feature_id and f.status='published'));
create policy revision_read on public.revisions for select using(exists(select 1 from public.features f where f.id=feature_id and f.status='published'));
create policy audit_read on public.moderation_audit for select to authenticated using(public.open_panel_role() in ('moderator','admin') or exists(select 1 from public.contributions c where c.id=contribution_id and c.author_id=auth.uid()));
create policy role_audit_read on public.role_audit for select to authenticated using(public.open_panel_role()='admin');
revoke all on public.profiles, public.features, public.contributions, public.published_additions, public.revisions, public.moderation_audit, public.role_audit from anon,authenticated;
grant select on public.features,public.published_additions,public.revisions,public.public_profiles to anon,authenticated;
grant select on public.profiles,public.contributions,public.moderation_audit,public.role_audit to authenticated;

create function public.save_contribution(payload jsonb, contribution_id uuid default null) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.contributions; result uuid; screenshot text:=coalesce(payload->>'screenshot_path','');
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not exists(select 1 from public.features where id=(payload->>'feature_id')::uuid and status='published') then raise exception 'Feature unavailable'; end if;
 if screenshot<>'' and (split_part(screenshot,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='open-panel-screenshots' and name=screenshot)) then raise exception 'Invalid screenshot'; end if;
 if contribution_id is null then
 insert into public.contributions(feature_id,author_id,type,target_section,title,body,screenshot_path,media_url,source_url)
 values((payload->>'feature_id')::uuid,auth.uid(),payload->>'type',payload->>'target_section',trim(payload->>'title'),trim(payload->>'body'),screenshot,coalesce(payload->>'media_url',''),coalesce(payload->>'source_url','')) returning id into result;
 insert into public.moderation_audit(contribution_id,action,new_status,actor_id) values(result,'Submitted','Submitted',auth.uid());
 else
 select * into c from public.contributions where id=contribution_id for update;
 if c.id is null or c.author_id<>auth.uid() or c.status not in ('Submitted','Changes Requested') or c.withdrawn_at is not null then raise exception 'Contribution cannot be edited' using errcode='42501'; end if;
 if c.feature_id<>(payload->>'feature_id')::uuid then raise exception 'Feature cannot change'; end if;
 update public.contributions set type=payload->>'type',target_section=payload->>'target_section',title=trim(payload->>'title'),body=trim(payload->>'body'),screenshot_path=screenshot,media_url=coalesce(payload->>'media_url',''),source_url=coalesce(payload->>'source_url',''),status='Submitted',updated_at=now() where id=c.id;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id) values(c.id,'Resubmitted',c.status,'Submitted',auth.uid()); result:=c.id;
 end if; return result;
end $$;
create function public.withdraw_contribution(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c public.contributions;
begin select * into c from public.contributions where id=target for update;
 if auth.uid() is null or c.id is null or c.author_id<>auth.uid() or c.status not in ('Submitted','Changes Requested') or c.withdrawn_at is not null then raise exception 'Contribution cannot be withdrawn' using errcode='42501'; end if;
 update public.contributions set withdrawn_at=now(),updated_at=now() where id=target;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id) values(target,'Withdrawn',c.status,c.status,auth.uid());
end $$;
create function public.moderate_contribution(target uuid, decision text, published_heading text default '', published_body text default '', note text default '') returns void language plpgsql security definer set search_path = '' as $$
declare c public.contributions; revision integer;
begin
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 select * into c from public.contributions where id=target for update;
 if c.id is null or c.withdrawn_at is not null or c.status in ('Accepted','Rejected') or c.status=decision or decision not in ('In Review','Changes Requested','Accepted','Rejected') then raise exception 'Invalid status transition'; end if;
 if length(note)>2000 or (decision in ('Changes Requested','Rejected') and length(trim(note))<4) then raise exception 'A useful moderator note is required'; end if;
 if decision='Accepted' then
 update public.features set current_revision=current_revision+1,updated_at=now() where id=c.feature_id and status='published' returning current_revision into revision;
 if revision is null then raise exception 'Feature is not published'; end if;
 insert into public.published_additions(contribution_id,feature_id,heading,body,target_section,display_order,contributor_id,publishing_moderator,revision_number,screenshot_path,media_url,source_url)
 values(c.id,c.feature_id,trim(published_heading),trim(published_body),c.target_section,revision,c.author_id,auth.uid(),revision,c.screenshot_path,c.media_url,c.source_url);
 insert into public.revisions(feature_id,revision_number,summary,contributor_ids) values(c.feature_id,revision,'Added: '||trim(published_heading),array[c.author_id]);
 end if;
 update public.contributions set status=decision,moderator_note=note,moderator_id=auth.uid(),reviewed_at=now(),updated_at=now() where id=target;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id,note) values(target,case when decision='Accepted' and (published_heading<>c.title or published_body<>c.body) then 'Edited and Accepted' else decision end,c.status,decision,auth.uid(),note);
end $$;
create function public.grant_open_panel_role(target uuid, new_role text) returns void language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
 if target=auth.uid() then raise exception 'Ask another administrator to change your role'; end if;
 select role into previous from public.profiles where id=target for update;
 if previous is null then raise exception 'Profile not found'; end if;
 update public.profiles set role=new_role,updated_at=now() where id=target;
 insert into public.role_audit(target_id,actor_id,previous_role,new_role) values(target,auth.uid(),previous,new_role);
end $$;
revoke all on function public.create_open_panel_profile(),public.open_panel_role(),public.save_contribution(jsonb,uuid),public.withdraw_contribution(uuid),public.moderate_contribution(uuid,text,text,text,text),public.grant_open_panel_role(uuid,text) from public,anon,authenticated;
grant execute on function public.open_panel_role() to anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid),public.withdraw_contribution(uuid),public.moderate_contribution(uuid,text,text,text,text),public.grant_open_panel_role(uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('open-panel-screenshots','open-panel-screenshots',false,5242880,array['image/png','image/jpeg','image/webp']);
create policy screenshot_upload on storage.objects for insert to authenticated with check(bucket_id='open-panel-screenshots' and (storage.foldername(name))[1]=auth.uid()::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$');
create policy screenshot_read on storage.objects for select using(bucket_id='open-panel-screenshots' and ((storage.foldername(name))[1]=auth.uid()::text or public.open_panel_role() in ('moderator','admin') or exists(select 1 from public.published_additions a join public.features f on f.id=a.feature_id where a.screenshot_path=name and f.status='published')));
-- No overwrite/delete policies: submitted and published evidence cannot be silently replaced.
insert into public.features(slug,title) values('time','TIME, REPLAYED'),('vice','THE BIGGEST SHADOW'),('tokon','DON’T MASH. LISTEN.'),('afterimage','THE FUTURE WAS PAINTED');
insert into public.revisions(feature_id,revision_number,summary) select id,1,'Published Panel: original editorial edition.' from public.features;
