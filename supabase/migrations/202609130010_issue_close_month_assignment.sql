-- Phase 4D issue-close alpha and manual archive month consistency.
-- Keeps panels attached to their calendar-month issue and closes issues idempotently.

create or replace function public.issue_drop_for_month(panel_date timestamptz) returns table(issue_id uuid, drop_id uuid) language plpgsql security definer set search_path='' as $$
declare
 v_year integer := extract(year from panel_date at time zone 'UTC')::integer;
 v_month integer := extract(month from panel_date at time zone 'UTC')::integer;
 v_issue uuid;
 v_drop uuid;
 v_issue_number integer;
 v_slug text;
 v_month_label text := lower(to_char(panel_date at time zone 'UTC','FMMonth'));
 v_title text := to_char(panel_date at time zone 'UTC','FMMonth YYYY');
begin
 select i.id into v_issue from public.issues i where i.year=v_year and i.month=v_month order by case when i.status in ('current','finalising') then 0 else 1 end limit 1;
 if v_issue is null then
   select coalesce(max(i.issue_number),0)+1 into v_issue_number from public.issues i;
   v_slug := 'issue-' || v_month_label || '-' || v_year::text;
   insert into public.issues(issue_number,slug,title,subtitle,cover_label,introduction,year,month,status,opens_at,closes_at,archived_at)
   values(v_issue_number,v_slug,v_title,'Archived KOMA://PLAY issue','KOMA://PLAY / ' || lpad(v_issue_number::text,3,'0'),'A completed monthly issue gathered from published panels.',v_year,v_month,'archived',make_timestamptz(v_year,v_month,1,0,0,0,'UTC'),make_timestamptz(v_year,v_month,1,0,0,0,'UTC') + interval '1 month',now())
   on conflict(year,month) do update set updated_at=now()
   returning id into v_issue;
 end if;
 select wd.id into v_drop from public.weekly_drops wd where wd.issue_id=v_issue and wd.status='published' order by wd.display_order desc, wd.week_number desc limit 1;
 if v_drop is null then
   insert into public.weekly_drops(issue_id,week_number,label,status,published_at,display_order)
   values(v_issue,1,'Archive', 'published', panel_date, 1)
   on conflict(issue_id,week_number) do update set status='published', published_at=coalesce(public.weekly_drops.published_at, excluded.published_at), updated_at=now()
   returning id into v_drop;
 end if;
 return query select v_issue, v_drop;
end $$;

create or replace function public.archive_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 doc public.editorial_documents;
 feature public.features;
 panel_date timestamptz;
 target_issue uuid;
 target_drop uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status<>'published' then raise exception 'Only published panels can be archived'; end if;
 select f.* into feature from public.features f where f.id=target for update;
 if feature.id is null or feature.status<>'published' then raise exception 'Only public panels can be archived'; end if;
 panel_date := coalesce(feature.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=target and s.reason ilike '%published%'),feature.created_at,feature.archived_at,now());
 select x.issue_id,x.drop_id into target_issue,target_drop from public.issue_drop_for_month(panel_date) x;
 update public.features f
    set issue_id=target_issue,
        weekly_drop_id=target_drop,
        lifecycle_status='archived',
        archived_at=coalesce(f.archived_at,now()),
        updated_at=now()
  where f.id=target;
 update public.editorial_documents ed set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Archived public panel',auth.uid());
 return target;
end $$;

create or replace function public.close_current_issue() returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 target_issue public.issues;
 target_drop uuid;
 archived_count integer := 0;
 included_count integer := 0;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select i.* into target_issue from public.issues i where i.status in ('current','finalising') order by i.opens_at desc limit 1 for update;
 if target_issue.id is null then
   return jsonb_build_object('status','noop','message','No current issue to close.','archivedPanelCount',0,'includedPanelCount',0);
 end if;
 select x.drop_id into target_drop from public.issue_drop_for_month(make_timestamptz(target_issue.year,target_issue.month,1,0,0,0,'UTC')) x;
 with eligible as (
   select f.id
   from public.features f
   left join public.editorial_documents ed on ed.feature_id=f.id
   where f.status='published'
     and coalesce(ed.lifecycle_status,f.lifecycle_status) in ('published','archived')
     and f.lifecycle_status <> 'taken_down'
     and (
       f.issue_id=target_issue.id
       or (
         extract(year from coalesce(f.published_at,f.created_at,f.archived_at) at time zone 'UTC')::integer=target_issue.year
         and extract(month from coalesce(f.published_at,f.created_at,f.archived_at) at time zone 'UTC')::integer=target_issue.month
       )
     )
 ), assigned as (
   update public.features f
      set issue_id=target_issue.id,
          weekly_drop_id=case when f.issue_id=target_issue.id and f.weekly_drop_id is not null then f.weekly_drop_id else target_drop end,
          lifecycle_status='archived',
          archived_at=coalesce(f.archived_at,now()),
          updated_at=now()
    where f.id in (select id from eligible)
    returning f.id
 ), docs as (
   update public.editorial_documents ed
      set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid()
    where ed.feature_id in (select id from eligible)
      and ed.lifecycle_status='published'
    returning ed.feature_id
 )
 select (select count(*) from docs), (select count(*) from assigned) into archived_count,included_count;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
 select ed.feature_id,ed.schema_version,ed.working_document,'Archived by issue close',auth.uid()
 from public.editorial_documents ed
 where ed.feature_id in (select id from public.features f where f.issue_id=target_issue.id and f.lifecycle_status='archived')
   and not exists(select 1 from public.editorial_document_snapshots s where s.feature_id=ed.feature_id and s.reason='Archived by issue close');
 update public.issues i set status='archived',archived_at=coalesce(i.archived_at,now()),updated_at=now() where i.id=target_issue.id;
 return jsonb_build_object('status','closed','issueId',target_issue.id,'issueSlug',target_issue.slug,'archivedPanelCount',archived_count,'includedPanelCount',included_count);
end $$;


create or replace function public.issue_close_preview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 actor public.profiles;
 target_issue public.issues;
 eligible_count integer := 0;
 published_count integer := 0;
 already_archived_count integer := 0;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select i.* into target_issue from public.issues i where i.status in ('current','finalising') order by i.opens_at desc limit 1;
 if target_issue.id is null then
   return jsonb_build_object('status','noop','message','No current issue to close.','eligiblePanelCount',0,'publishedPanelCount',0,'alreadyArchivedPanelCount',0);
 end if;
 select count(*),
        count(*) filter (where coalesce(ed.lifecycle_status,f.lifecycle_status)='published'),
        count(*) filter (where coalesce(ed.lifecycle_status,f.lifecycle_status)='archived')
   into eligible_count,published_count,already_archived_count
 from public.features f
 left join public.editorial_documents ed on ed.feature_id=f.id
 where f.status='published'
   and coalesce(ed.lifecycle_status,f.lifecycle_status) in ('published','archived')
   and f.lifecycle_status <> 'taken_down'
   and (
     f.issue_id=target_issue.id
     or (
       extract(year from coalesce(f.published_at,f.created_at,f.archived_at) at time zone 'UTC')::integer=target_issue.year
       and extract(month from coalesce(f.published_at,f.created_at,f.archived_at) at time zone 'UTC')::integer=target_issue.month
     )
   );
 return jsonb_build_object('status','ready','issueId',target_issue.id,'issueSlug',target_issue.slug,'issueTitle',target_issue.title,'year',target_issue.year,'month',target_issue.month,'eligiblePanelCount',eligible_count,'publishedPanelCount',published_count,'alreadyArchivedPanelCount',already_archived_count);
end $$;

revoke all on function public.issue_drop_for_month(timestamptz),public.archive_editorial_panel(uuid),public.close_current_issue(),public.issue_close_preview() from public,anon,authenticated;
grant execute on function public.archive_editorial_panel(uuid),public.close_current_issue(),public.issue_close_preview() to authenticated;
