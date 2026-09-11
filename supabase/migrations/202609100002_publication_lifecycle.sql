create table public.issues (
 id uuid primary key default gen_random_uuid(), issue_number integer unique not null check(issue_number>=0), slug text unique not null check(slug ~ '^[a-z0-9-]+$'),
 title text not null check(length(title) between 1 and 150), subtitle text not null default '', cover_label text not null default '', introduction text not null default '',
 year integer not null check(year between 2000 and 2200), month integer not null check(month between 1 and 12),
 status text not null default 'draft' check(status in ('draft','current','finalising','archived')),
 opens_at timestamptz not null, closes_at timestamptz not null, archived_at timestamptz, created_by uuid references public.profiles(id),
 closing_days integer not null default 7 check(closing_days between 0 and 30), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(year,month),check(closes_at>opens_at)
);
create unique index one_current_issue on public.issues((status)) where status='current';
create table public.weekly_drops (
 id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.issues(id),week_number integer not null check(week_number between 1 and 5),
 label text not null check(length(label) between 1 and 150),introduction text not null default '',status text not null default 'draft' check(status in ('draft','scheduled','published')),
 scheduled_at timestamptz,published_at timestamptz,display_order integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(issue_id,week_number),unique(id,issue_id),check(status<>'scheduled' or scheduled_at is not null),check(status<>'published' or published_at is not null)
);
create table public.categories(id uuid primary key default gen_random_uuid(),name text unique not null,slug text unique not null);
create table public.content_formats(id uuid primary key default gen_random_uuid(),name text unique not null,slug text unique not null);
create table public.tags(id uuid primary key default gen_random_uuid(),name text unique not null,slug text unique not null,kind text not null check(kind in ('franchise','platform','genre','era','subject')));
insert into public.categories(name,slug) values('Gaming','gaming'),('Anime','anime'),('Manga','manga'),('Culture','culture');
insert into public.content_formats(name,slug) values('News','news'),('Guide','guide'),('Review','review'),('Essay','essay'),('Impressions','impressions'),('Discovery','discovery');
alter table public.features add column issue_id uuid references public.issues(id),add column weekly_drop_id uuid,
 add column strip_position integer not null default 0,add column category_id uuid references public.categories(id),add column format_id uuid references public.content_formats(id),
 add column lifecycle_status text not null default 'draft' check(lifecycle_status in ('draft','open_panel','closing_panel','final_panel','archived')),
 add column deadline_override timestamptz,add column finalised_at timestamptz,add column archived_at timestamptz,
 add column summary text not null default '',add column image text not null default '/assets/clue-ocarina.png',add column image_alt text not null default '',
 add column panel_size text not null default 'standard' check(panel_size in ('narrow','standard','wide')),add column panel_class text not null default '',
 add column editorial_body text not null default '';
alter table public.features add constraint feature_slug_safe check(slug ~ '^[a-z0-9-]+$');
alter table public.features add constraint feature_drop_issue foreign key(weekly_drop_id,issue_id) references public.weekly_drops(id,issue_id);
alter table public.features add constraint feature_assignment_pair check((weekly_drop_id is null)=(issue_id is null));
create table public.feature_tags(feature_id uuid not null references public.features(id),tag_id uuid not null references public.tags(id),primary key(feature_id,tag_id));
create table public.feature_relationships(feature_id uuid not null references public.features(id),related_id uuid not null references public.features(id),kind text not null check(kind in ('continues_from','related')),primary key(feature_id,related_id,kind),check(feature_id<>related_id));
create index feature_search on public.features using gin(to_tsvector('simple',title||' '||summary||' '||editorial_body));
insert into public.issues(issue_number,slug,title,cover_label,year,month,status,opens_at,closes_at)
 values(0,'issue-zero-september-2026','Issue Zero','INK//:PLAY / 000',2026,9,'current','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z');
insert into public.weekly_drops(issue_id,week_number,label,status,published_at,display_order) select id,1,'First Frame','published','2026-09-10T00:00:00Z',1 from public.issues where issue_number=0;
update public.features set issue_id=(select id from public.issues where issue_number=0),weekly_drop_id=(select id from public.weekly_drops limit 1),
 lifecycle_status='open_panel',category_id=(select id from public.categories where slug=case when features.slug='afterimage' then 'anime' else 'gaming' end),
 format_id=(select id from public.content_formats where slug=case when features.slug='tokon' then 'guide' when features.slug='time' then 'news' else 'essay' end),
 strip_position=case slug when 'time' then 1 when 'vice' then 2 when 'tokon' then 3 else 4 end,
 image=case slug when 'time' then '/assets/clue-ocarina.png' when 'vice' then '/assets/clue-seat.png' when 'tokon' then '/assets/clue-shield.png' else '/assets/clue-vhs.png' end,
 panel_size=case slug when 'tokon' then 'narrow' when 'time' then 'standard' else 'wide' end,
 panel_class=case slug when 'time' then 'ocarina' when 'afterimage' then 'vhs' else slug end,
 summary=case slug when 'time' then 'What should a faithful remake remember?' when 'vice' then 'Seventy days until Leonida opens.' when 'tokon' then 'A true beginner’s guide to Tōkon.' else 'Why the OVA look keeps returning.' end,
 image_alt=case slug when 'time' then 'A worn ceramic ocarina' when 'vice' then 'A gun resting on an empty car seat' when 'tokon' then 'A gouged round hero shield' else 'A battered INK//:PLAY VHS tape' end;

create function public.feature_is_public(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.features f join public.issues i on i.id=f.issue_id join public.weekly_drops d on d.id=f.weekly_drop_id
 where f.id=target and f.status='published' and f.lifecycle_status<>'draft' and i.status<>'draft' and d.status='published' and f.published_at<=now() and d.published_at<=now()) $$;
create function public.feature_accepts_contributions(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.features f join public.issues i on i.id=f.issue_id where f.id=target and public.feature_is_public(f.id)
 and f.lifecycle_status in ('open_panel','closing_panel') and i.status in ('current','finalising') and now()>=i.opens_at and now()<coalesce(f.deadline_override,i.closes_at)) $$;
create function public.assert_open_panel(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Shared locks serialize submissions against deadline/assignment changes and archiving.
 perform 1 from public.features f join public.issues i on i.id=f.issue_id where f.id=target for share of f,i;
 if not public.feature_accepts_contributions(target) then raise exception 'This Workshop is closed. Use a private correction report for factual concerns.' using errcode='42501'; end if;
end $$;
alter function public.save_contribution(jsonb,uuid) rename to save_contribution_before_lifecycle;
alter function public.withdraw_contribution(uuid) rename to withdraw_contribution_before_lifecycle;
alter function public.moderate_contribution(uuid,text,text,text,text) rename to moderate_contribution_before_lifecycle;
revoke all on function public.save_contribution_before_lifecycle(jsonb,uuid),public.withdraw_contribution_before_lifecycle(uuid),public.moderate_contribution_before_lifecycle(uuid,text,text,text,text) from public,anon,authenticated;
create function public.save_contribution(payload jsonb,contribution_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
begin perform public.assert_open_panel((payload->>'feature_id')::uuid);return public.save_contribution_before_lifecycle(payload,contribution_id);end $$;
create function public.withdraw_contribution(target uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform public.assert_open_panel((select feature_id from public.contributions where id=target));perform public.withdraw_contribution_before_lifecycle(target);end $$;
create function public.moderate_contribution(target uuid,decision text,published_heading text default '',published_body text default '',note text default '') returns void language plpgsql security definer set search_path='' as $$
declare issue_status text;
begin
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501';end if;
 select i.status into issue_status from public.contributions c join public.features f on f.id=c.feature_id join public.issues i on i.id=f.issue_id where c.id=target for share of i;
 if issue_status is null or issue_status not in ('current','finalising') then raise exception 'This issue is read-only';end if;
 perform public.moderate_contribution_before_lifecycle(target,decision,published_heading,published_body,note);
end $$;

create table public.correction_reports (
 id uuid primary key default gen_random_uuid(),feature_id uuid not null references public.features(id),reporter_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('Factual error','Incorrect attribution','Broken source','Safety concern','Legal or rights concern')),
 body text not null check(length(trim(body)) between 20 and 4000),source_url text not null default '' check(source_url='' or source_url ~ '^https://[^/@[:space:]]+([/:?#][^[:space:]]*)?$'),
 status text not null default 'Submitted' check(status in ('Submitted','In Review','Resolved','Dismissed')),moderator_note text,moderator_id uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),reviewed_at timestamptz
);
create index corrections_reporter on public.correction_reports(reporter_id,created_at);
create table public.correction_audit(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.correction_reports(id),actor_id uuid not null references public.profiles(id),previous_status text,new_status text not null,note text,created_at timestamptz not null default now());
create function public.submit_correction(target uuid,report_kind text,report_body text,source text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to verify your correction report' using errcode='42501';end if;
 if not public.feature_is_public(target) or public.feature_accepts_contributions(target) then raise exception 'Use the active Workshop for this feature';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from public.correction_reports where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=3 then raise exception 'Limit reached: three correction reports per hour';end if;
 insert into public.correction_reports(feature_id,reporter_id,kind,body,source_url) values(target,auth.uid(),report_kind,trim(report_body),source) returning id into result;
 insert into public.correction_audit(report_id,actor_id,new_status) values(result,auth.uid(),'Submitted');return result;
end $$;
create function public.review_correction(target uuid,decision text,note text) returns void language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501';end if;
 select status into previous from public.correction_reports where id=target for update;
 if previous is null or previous in ('Resolved','Dismissed') or decision not in ('In Review','Resolved','Dismissed') or decision=previous or length(trim(note))<4 or length(note)>2000 then raise exception 'Invalid correction decision or missing note';end if;
 update public.correction_reports set status=decision,moderator_note=note,moderator_id=auth.uid(),updated_at=now(),reviewed_at=now() where id=target;
 insert into public.correction_audit(report_id,actor_id,previous_status,new_status,note) values(target,auth.uid(),previous,decision,note);
end $$;

alter table public.issues enable row level security;alter table public.weekly_drops enable row level security;
alter table public.categories enable row level security;alter table public.content_formats enable row level security;alter table public.tags enable row level security;
alter table public.feature_tags enable row level security;alter table public.feature_relationships enable row level security;
alter table public.correction_reports enable row level security;alter table public.correction_audit enable row level security;
create policy issues_read on public.issues for select using(status<>'draft' or public.open_panel_role() in ('moderator','admin'));
create policy drops_read on public.weekly_drops for select using((status='published' and published_at<=now() and exists(select 1 from public.issues i where i.id=issue_id and i.status<>'draft')) or public.open_panel_role() in ('moderator','admin'));
create policy categories_read on public.categories for select using(true);create policy formats_read on public.content_formats for select using(true);create policy tags_read on public.tags for select using(true);
create policy feature_tags_read on public.feature_tags for select using(public.feature_is_public(feature_id) or public.open_panel_role() in ('moderator','admin'));
create policy relationships_read on public.feature_relationships for select using((public.feature_is_public(feature_id) and public.feature_is_public(related_id)) or public.open_panel_role() in ('moderator','admin'));
create policy corrections_read on public.correction_reports for select to authenticated using(reporter_id=auth.uid() or public.open_panel_role() in ('moderator','admin'));
create policy corrections_audit_read on public.correction_audit for select to authenticated using(public.open_panel_role() in ('moderator','admin') or exists(select 1 from public.correction_reports r where r.id=report_id and r.reporter_id=auth.uid()));
drop policy feature_read on public.features;create policy feature_read on public.features for select using(public.feature_is_public(id) or public.open_panel_role() in ('moderator','admin'));
drop policy addition_read on public.published_additions;create policy addition_read on public.published_additions for select using(public.feature_is_public(feature_id));
drop policy revision_read on public.revisions;create policy revision_read on public.revisions for select using(public.feature_is_public(feature_id));
revoke all on public.issues,public.weekly_drops,public.categories,public.content_formats,public.tags,public.feature_tags,public.feature_relationships,public.correction_reports,public.correction_audit from anon,authenticated;
grant select on public.issues,public.weekly_drops,public.categories,public.content_formats,public.tags,public.feature_tags,public.feature_relationships to anon,authenticated;
grant select on public.correction_reports,public.correction_audit to authenticated;
create function public.reconcile_publication() returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 update public.issues set status='finalising',updated_at=now() where status='current' and closes_at<=now();
 -- A scheduled drop past its issue deadline stays unpublished for intentional carry-over.
 update public.weekly_drops d set status='published',published_at=d.scheduled_at,updated_at=now() from public.issues i
 where i.id=d.issue_id and i.status='current' and now()<i.closes_at and d.status='scheduled' and d.scheduled_at<=now();
 update public.features f set lifecycle_status='final_panel',finalised_at=coalesce(f.finalised_at,now()) from public.issues i
 where i.id=f.issue_id and public.feature_is_public(f.id) and f.lifecycle_status in ('open_panel','closing_panel') and coalesce(f.deadline_override,i.closes_at)<=now();
 update public.features f set lifecycle_status='closing_panel' from public.issues i where i.id=f.issue_id and public.feature_accepts_contributions(f.id) and f.lifecycle_status='open_panel' and coalesce(f.deadline_override,i.closes_at)<=now()+make_interval(days=>i.closing_days);
end $$;
create function public.manage_publication(kind text,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=nullif(payload->>'id','')::uuid; result uuid; old_feature public.features; old_issue public.issues; parent public.issues; drop_row public.weekly_drops; next_status text;
begin
 if coalesce(public.open_panel_role(),'')<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 if kind='issue' then
 if target is not null then select * into old_issue from public.issues where id=target for update;if old_issue.status='archived' then raise exception 'Archived issues are immutable';end if;end if;
 if target is null then
 insert into public.issues(issue_number,slug,title,subtitle,cover_label,introduction,year,month,opens_at,closes_at,closing_days,created_by)
 values((payload->>'issue_number')::integer,payload->>'slug',payload->>'title',coalesce(payload->>'subtitle',''),coalesce(payload->>'cover_label',''),coalesce(payload->>'introduction',''),(payload->>'year')::integer,(payload->>'month')::integer,(payload->>'opens_at')::timestamptz,(payload->>'closes_at')::timestamptz,coalesce((payload->>'closing_days')::integer,7),auth.uid()) returning id into result;
 else
 if old_issue.status='finalising' and ((payload->>'closes_at')::timestamptz)>old_issue.closes_at then raise exception 'A finalising issue cannot reopen. Use an exceptional feature override before finalisation.';end if;
 update public.issues set title=payload->>'title',subtitle=coalesce(payload->>'subtitle',''),cover_label=coalesce(payload->>'cover_label',''),introduction=coalesce(payload->>'introduction',''),opens_at=(payload->>'opens_at')::timestamptz,closes_at=(payload->>'closes_at')::timestamptz,closing_days=coalesce((payload->>'closing_days')::integer,7),updated_at=now() where id=target returning id into result;
 end if;
 elsif kind='issue-state' then
 select * into old_issue from public.issues where id=target for update;next_status:=payload->>'status';
 if old_issue.id is null or old_issue.status='archived' or next_status not in ('current','finalising','archived') then raise exception 'Invalid issue transition';end if;
 if next_status='current' and (old_issue.status<>'draft' or old_issue.closes_at<=now()) then raise exception 'Only a draft issue with a future deadline can become current';end if;
 if next_status='finalising' and old_issue.status<>'current' then raise exception 'Only the current issue can enter finalising';end if;
 if next_status='archived' then
 if old_issue.status<>'finalising' or now()<old_issue.closes_at then raise exception 'Finalise the issue after its deadline before archiving';end if;
 if exists(select 1 from public.features f where f.issue_id=target and (f.lifecycle_status='draft' or not public.feature_is_public(f.id) or coalesce(f.deadline_override,old_issue.closes_at)>now())) then raise exception 'Carry unpublished features forward and wait for all deadlines';end if;
 if exists(select 1 from public.contributions c join public.features f on f.id=c.feature_id where f.issue_id=target and c.withdrawn_at is null and c.status in ('Submitted','In Review','Changes Requested')) then raise exception 'Resolve outstanding contributions before archiving';end if;
 if old_issue.issue_number<>0 and (select count(*) from public.weekly_drops where issue_id=target and status='published') not between 4 and 5 then raise exception 'Publish four or five weekly drops before archiving';end if;
 update public.features set lifecycle_status='archived',finalised_at=coalesce(finalised_at,now()),archived_at=now() where issue_id=target and lifecycle_status<>'draft';
 end if;
 update public.issues set status=next_status,closes_at=case when next_status='finalising' then least(closes_at,now()) else closes_at end,archived_at=case when next_status='archived' then now() else archived_at end,updated_at=now() where id=target returning id into result;
 elsif kind='drop' then
 select * into parent from public.issues where id=(payload->>'issue_id')::uuid for share;
 if parent.id is null or parent.status in ('finalising','archived') then raise exception 'Issue is read-only for publishing';end if;
 next_status:=payload->>'status';
 if next_status='published' and (parent.status<>'current' or parent.closes_at<=now()) then raise exception 'Publish into the current, open issue';end if;
 if next_status='scheduled' and ((payload->>'scheduled_at')::timestamptz>=parent.closes_at or (payload->>'scheduled_at')::timestamptz<parent.opens_at) then raise exception 'Schedule within the issue window';end if;
 if target is not null then
 select * into drop_row from public.weekly_drops where id=target for update;
 if drop_row.issue_id<>parent.id or (drop_row.status='published' and next_status<>'published') then raise exception 'Published drops cannot be moved or withdrawn';end if;
 update public.weekly_drops set label=payload->>'label',introduction=coalesce(payload->>'introduction',''),week_number=(payload->>'week_number')::integer,status=next_status,scheduled_at=nullif(payload->>'scheduled_at','')::timestamptz,published_at=case when next_status='published' then coalesce(published_at,now()) else null end,display_order=(payload->>'display_order')::integer,updated_at=now() where id=target returning id into result;
 else
 insert into public.weekly_drops(issue_id,week_number,label,introduction,status,scheduled_at,published_at,display_order) values(parent.id,(payload->>'week_number')::integer,payload->>'label',coalesce(payload->>'introduction',''),next_status,nullif(payload->>'scheduled_at','')::timestamptz,case when next_status='published' then now() end,(payload->>'display_order')::integer) returning id into result;
 end if;
 elsif kind='feature' then
 select * into parent from public.issues where id=(payload->>'issue_id')::uuid for share;
 if parent.id is null or parent.status in ('finalising','archived') then raise exception 'Assign to a draft or current issue';end if;
 if not exists(select 1 from public.weekly_drops where id=(payload->>'weekly_drop_id')::uuid and issue_id=parent.id) then raise exception 'Drop must belong to the selected issue';end if;
 next_status:=payload->>'lifecycle_status';if next_status not in ('draft','open_panel') then raise exception 'Use lifecycle reconciliation for closed states';end if;
 if next_status='open_panel' and (parent.status<>'current' or coalesce(nullif(payload->>'deadline_override','')::timestamptz,parent.closes_at)<=now()) then raise exception 'Cannot publish into a closed issue';end if;
 if target is not null then
 select * into old_feature from public.features where id=target for update;
 if old_feature.lifecycle_status<>'draft' and coalesce(old_feature.deadline_override,(select closes_at from public.issues where id=old_feature.issue_id))<=now() then raise exception 'Final Panels cannot be reopened or rewritten. Publish a follow-up feature.';end if;
 if old_feature.lifecycle_status in ('final_panel','archived') or (old_feature.lifecycle_status<>'draft' and (old_feature.issue_id<>parent.id or old_feature.weekly_drop_id<>(payload->>'weekly_drop_id')::uuid)) then raise exception 'Only unpublished features can move issues or drops';end if;
 if next_status='draft' and exists(select 1 from public.contributions where feature_id=target) then raise exception 'A feature with contribution history cannot be unpublished';end if;
 update public.features set title=payload->>'title',issue_id=parent.id,weekly_drop_id=(payload->>'weekly_drop_id')::uuid,strip_position=(payload->>'strip_position')::integer,category_id=(payload->>'category_id')::uuid,format_id=(payload->>'format_id')::uuid,lifecycle_status=next_status,status=case when next_status='draft' then 'draft' else 'published' end,deadline_override=nullif(payload->>'deadline_override','')::timestamptz,summary=coalesce(payload->>'summary',''),editorial_body=coalesce(payload->>'editorial_body',''),image=coalesce(payload->>'image',image),image_alt=coalesce(payload->>'image_alt',image_alt),panel_size=coalesce(payload->>'panel_size',panel_size),panel_class=coalesce(payload->>'panel_class',panel_class),published_at=case when old_feature.lifecycle_status='draft' and next_status='open_panel' then now() else published_at end,updated_at=now() where id=target returning id into result;
 else
 insert into public.features(slug,title,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,status,deadline_override,summary,editorial_body,image,image_alt,panel_size,panel_class)
 values(payload->>'slug',payload->>'title',parent.id,(payload->>'weekly_drop_id')::uuid,(payload->>'strip_position')::integer,(payload->>'category_id')::uuid,(payload->>'format_id')::uuid,next_status,case when next_status='draft' then 'draft' else 'published' end,nullif(payload->>'deadline_override','')::timestamptz,coalesce(payload->>'summary',''),coalesce(payload->>'editorial_body',''),coalesce(payload->>'image','/assets/clue-ocarina.png'),coalesce(payload->>'image_alt',''),coalesce(payload->>'panel_size','standard'),coalesce(payload->>'panel_class','')) returning id into result;
 insert into public.revisions(feature_id,revision_number,summary) values(result,1,'Published Panel: original editorial edition.');
 end if;
 delete from public.feature_tags where feature_id=result;
 insert into public.feature_tags(feature_id,tag_id) select result,value::uuid from jsonb_array_elements_text(coalesce(payload->'tag_ids','[]'));
 elsif kind='category' then insert into public.categories(name,slug) values(payload->>'name',payload->>'slug') returning id into result;
 elsif kind='format' then insert into public.content_formats(name,slug) values(payload->>'name',payload->>'slug') returning id into result;
 elsif kind='tag' then insert into public.tags(name,slug,kind) values(payload->>'name',payload->>'slug',payload->>'kind') returning id into result;
 elsif kind='relationship' then
 insert into public.feature_relationships(feature_id,related_id,kind) values((payload->>'feature_id')::uuid,(payload->>'related_id')::uuid,payload->>'kind');result:=(payload->>'feature_id')::uuid;
 else raise exception 'Unknown publishing action';
 end if;
 if result is null then raise exception 'Record not found';end if;return result;
end $$;
-- Explicit grants for every privileged entry point, including renamed legacy functions.
revoke all on function public.feature_is_public(uuid),public.feature_accepts_contributions(uuid),public.assert_open_panel(uuid),public.save_contribution(jsonb,uuid),public.withdraw_contribution(uuid),public.moderate_contribution(uuid,text,text,text,text),public.submit_correction(uuid,text,text,text),public.review_correction(uuid,text,text),public.reconcile_publication(),public.manage_publication(text,jsonb) from public,anon,authenticated;
grant execute on function public.feature_is_public(uuid),public.feature_accepts_contributions(uuid) to anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid),public.withdraw_contribution(uuid),public.moderate_contribution(uuid,text,text,text,text),public.submit_correction(uuid,text,text,text),public.review_correction(uuid,text,text),public.reconcile_publication(),public.manage_publication(text,jsonb) to authenticated;
