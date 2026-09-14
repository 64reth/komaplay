-- Phase 4D issue close membership repair.
-- Include seeded/static issue panels in the archived issue while only transitioning editorial lifecycle panels.

create or replace function public.close_current_issue() returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles;
 target_issue public.issues;
 target_drop uuid;
 transitioned_editorial_count integer := 0;
 included_count integer := 0;
 static_count integer := 0;
 current_panel_date timestamptz := now();
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;

 select coalesce(max(coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at)), now())
 into current_panel_date
 from public.features f
 left join public.editorial_documents ed on ed.feature_id=f.id
 where f.status='published'
   and f.lifecycle_status <> 'taken_down'
   and (ed.feature_id is null or ed.lifecycle_status in ('published','archived'));

 select i.* into target_issue
 from public.issues i
 where i.status in ('current','finalising','published','open')
   and (
     now() between coalesce(i.opens_at, make_timestamptz(i.year,i.month,1,0,0,0,'UTC')) and coalesce(i.closes_at, make_timestamptz(i.year,i.month,1,0,0,0,'UTC') + interval '1 month')
     or (i.year=extract(year from current_panel_date at time zone 'UTC')::integer and i.month=extract(month from current_panel_date at time zone 'UTC')::integer)
   )
 order by case when i.status in ('current','finalising') then 0 else 1 end,
          i.opens_at desc nulls last,
          i.created_at desc
 limit 1
 for update;

 if target_issue.id is null then
   select i.* into target_issue from public.issues i where i.id=(select x.issue_id from public.issue_drop_for_month(current_panel_date) x limit 1) for update;
 end if;

 select x.drop_id into target_drop from public.issue_drop_for_month(make_timestamptz(target_issue.year,target_issue.month,1,0,0,0,'UTC')) x;

 with issue_members as (
   select f.id, ed.feature_id is not null as is_editorial, ed.lifecycle_status as editorial_status
   from public.features f
   left join public.editorial_documents ed on ed.feature_id=f.id
   where f.status='published'
     and f.lifecycle_status <> 'taken_down'
     and (ed.feature_id is null or ed.lifecycle_status in ('published','archived'))
     and (
       f.issue_id=target_issue.id
       or (
         extract(year from coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at) at time zone 'UTC')::integer=target_issue.year
         and extract(month from coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at) at time zone 'UTC')::integer=target_issue.month
       )
     )
 ), assigned as (
   update public.features f
      set issue_id=target_issue.id,
          weekly_drop_id=case when f.issue_id=target_issue.id and f.weekly_drop_id is not null then f.weekly_drop_id else target_drop end,
          lifecycle_status=case when m.is_editorial then 'archived' else f.lifecycle_status end,
          archived_at=case when m.is_editorial then coalesce(f.archived_at,now()) else f.archived_at end,
          updated_at=now()
    from issue_members m
    where f.id=m.id
    returning f.id, m.is_editorial
 ), docs as (
   update public.editorial_documents ed
      set lifecycle_status='archived',updated_at=now(),revision_token=gen_random_uuid()
    where ed.feature_id in (select id from issue_members where is_editorial)
      and ed.lifecycle_status='published'
    returning ed.feature_id
 )
 select (select count(*) from docs), (select count(*) from assigned), (select count(*) from assigned where not is_editorial)
 into transitioned_editorial_count,included_count,static_count;

 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by)
 select ed.feature_id,ed.schema_version,ed.working_document,'Archived by issue close',auth.uid()
 from public.editorial_documents ed
 where ed.feature_id in (select f.id from public.features f where f.issue_id=target_issue.id and f.lifecycle_status='archived')
   and not exists(select 1 from public.editorial_document_snapshots s where s.feature_id=ed.feature_id and s.reason='Archived by issue close');
 update public.issues i set status='archived',archived_at=coalesce(i.archived_at,now()),updated_at=now() where i.id=target_issue.id;
 return jsonb_build_object('status','closed','issueId',target_issue.id,'issueSlug',target_issue.slug,'archivedPanelCount',transitioned_editorial_count,'includedPanelCount',included_count,'staticPanelCount',static_count,'editorialPanelCount',transitioned_editorial_count);
end $$;

create or replace function public.issue_close_preview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 actor public.profiles;
 target_issue public.issues;
 included_count integer := 0;
 editorial_count integer := 0;
 already_archived_count integer := 0;
 static_count integer := 0;
 current_panel_date timestamptz := now();
 target_year integer;
 target_month integer;
 target_title text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;

 select coalesce(max(coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at)), now())
 into current_panel_date
 from public.features f
 left join public.editorial_documents ed on ed.feature_id=f.id
 where f.status='published'
   and f.lifecycle_status <> 'taken_down'
   and (ed.feature_id is null or ed.lifecycle_status in ('published','archived'));

 target_year := extract(year from current_panel_date at time zone 'UTC')::integer;
 target_month := extract(month from current_panel_date at time zone 'UTC')::integer;
 target_title := to_char(current_panel_date at time zone 'UTC','FMMonth YYYY');

 select i.* into target_issue
 from public.issues i
 where i.status in ('current','finalising','published','open')
   and (
     now() between coalesce(i.opens_at, make_timestamptz(i.year,i.month,1,0,0,0,'UTC')) and coalesce(i.closes_at, make_timestamptz(i.year,i.month,1,0,0,0,'UTC') + interval '1 month')
     or (i.year=target_year and i.month=target_month)
   )
 order by case when i.status in ('current','finalising') then 0 else 1 end,
          i.opens_at desc nulls last,
          i.created_at desc
 limit 1;

 if target_issue.id is not null then
   target_year := target_issue.year;
   target_month := target_issue.month;
   target_title := target_issue.title;
 end if;

 select count(*),
        count(*) filter (where ed.feature_id is not null and ed.lifecycle_status='published'),
        count(*) filter (where ed.feature_id is not null and ed.lifecycle_status='archived'),
        count(*) filter (where ed.feature_id is null)
   into included_count,editorial_count,already_archived_count,static_count
 from public.features f
 left join public.editorial_documents ed on ed.feature_id=f.id
 where f.status='published'
   and f.lifecycle_status <> 'taken_down'
   and (ed.feature_id is null or ed.lifecycle_status in ('published','archived'))
   and (
     (target_issue.id is not null and f.issue_id=target_issue.id)
     or (
       extract(year from coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at) at time zone 'UTC')::integer=target_year
       and extract(month from coalesce(f.published_at,(select min(s.created_at) from public.editorial_document_snapshots s where s.feature_id=f.id and s.reason ilike '%published%'),f.updated_at,f.archived_at) at time zone 'UTC')::integer=target_month
     )
   );

 if included_count = 0 then
   return jsonb_build_object('status','empty','message','No published panels are ready to close for this issue.','issueId',target_issue.id,'issueSlug',target_issue.slug,'issueTitle',target_title,'eligiblePanelCount',0,'includedPanelCount',0,'editorialPanelCount',0,'publishedPanelCount',0,'alreadyArchivedPanelCount',0,'staticPanelCount',0);
 end if;
 return jsonb_build_object('status','ready','issueId',target_issue.id,'issueSlug',target_issue.slug,'issueTitle',target_title,'year',target_year,'month',target_month,'eligiblePanelCount',included_count,'includedPanelCount',included_count,'editorialPanelCount',editorial_count,'publishedPanelCount',editorial_count,'alreadyArchivedPanelCount',already_archived_count,'staticPanelCount',static_count,'willCreateIssue',target_issue.id is null);
end $$;

revoke all on function public.close_current_issue(),public.issue_close_preview() from public,anon,authenticated;
grant execute on function public.close_current_issue(),public.issue_close_preview() to authenticated;
