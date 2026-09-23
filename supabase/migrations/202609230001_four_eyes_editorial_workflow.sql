-- Enforce independent review for canonical editorial and Open Panel work.
-- Additive only: historical contributions, citations, additions and snapshots remain intact.
begin;

alter table public.editorial_documents
  add column if not exists submitted_by uuid references public.profiles(id),
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

update public.editorial_documents
set submitted_by = author_id
where submitted_by is null
  and (submitted_at is not null or lifecycle_status <> 'draft');

create or replace function public.capture_editorial_submission_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.lifecycle_status = 'submitted'
     and (tg_op = 'INSERT' or old.lifecycle_status is distinct from 'submitted') then
    new.submitted_by := auth.uid();
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_editorial_submission_actor() from public,anon,authenticated;
drop trigger if exists editorial_submission_actor on public.editorial_documents;
create trigger editorial_submission_actor
  before insert or update of lifecycle_status on public.editorial_documents
  for each row execute function public.capture_editorial_submission_actor();

create or replace function public.editorial_review_draft(target uuid, decision text, review_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; doc public.editorial_documents; next_status text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select * into actor from public.profiles where id=auth.uid();
 if actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Review access required' using errcode='42501'; end if;
 if decision='approve' then next_status:='approved'; elsif decision='changes' then next_status:='changes_requested'; else raise exception 'Invalid review decision'; end if;
 select * into doc from public.editorial_documents where feature_id=target for update;
 if doc.feature_id is null or doc.lifecycle_status not in ('submitted','changes_requested','approved') then raise exception 'Submitted draft not found'; end if;
 if auth.uid()=doc.author_id or auth.uid()=coalesce(doc.submitted_by,doc.author_id) then raise exception 'Independent review required' using errcode='42501'; end if;
 if next_status='changes_requested' and length(trim(coalesce(review_note,'')))<4 then raise exception 'A useful reviewer note is required'; end if;
 update public.editorial_documents set lifecycle_status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now(),revision_token=gen_random_uuid() where feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,case when next_status='approved' then 'Marked publish-ready by independent reviewer' else 'Changes requested: '||left(coalesce(review_note,''),220) end,auth.uid());
 return target;
end $$;

drop function if exists public.editorial_review_inbox();
create function public.editorial_review_inbox()
returns table(feature_id uuid,title text,slug text,summary text,lifecycle_status text,updated_at timestamptz,working_document jsonb,author_display_name text,author_id uuid,submitted_by uuid,reviewed_by uuid,can_review boolean)
language sql stable security definer set search_path='' as $$
 select f.id,f.title,f.slug,f.summary,case when ed.lifecycle_status='approved' then 'publish_ready' else ed.lifecycle_status end,ed.updated_at,ed.working_document,coalesce(nullif(p.display_name,''),'Panelist'),ed.author_id,coalesce(ed.submitted_by,ed.author_id),ed.reviewed_by,
        auth.uid()<>ed.author_id and auth.uid()<>coalesce(ed.submitted_by,ed.author_id)
 from public.editorial_documents ed join public.features f on f.id=ed.feature_id left join public.profiles p on p.id=ed.author_id
 where public.editorial_has_access(auth.uid(),false) and ed.lifecycle_status in ('submitted','changes_requested','approved')
 order by ed.updated_at desc;
$$;
revoke all on function public.editorial_review_inbox() from public,anon,authenticated;
grant execute on function public.editorial_review_inbox() to authenticated;

create or replace function public.publish_editorial_panel(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare actor public.profiles; doc public.editorial_documents; feature public.features; next_position integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.require_handbook_acceptance();
 select p.* into actor from public.profiles p where p.id=auth.uid();
 if actor.id is null or actor.account_status<>'active' or not public.editorial_has_access(auth.uid(),true) then raise exception 'Moderator access required' using errcode='42501'; end if;
 select ed.* into doc from public.editorial_documents ed where ed.feature_id=target for update;
 if doc.feature_id is null then raise exception 'Editorial panel not found'; end if;
 if doc.lifecycle_status<>'approved' then raise exception 'Only publish-ready panels can be published'; end if;
 if doc.reviewed_by is null or doc.reviewed_by=doc.author_id or doc.reviewed_by=coalesce(doc.submitted_by,doc.author_id) then raise exception 'Independent approval is required before publication' using errcode='42501'; end if;
 select f.* into feature from public.features f where f.id=target for update;
 if feature.id is null then raise exception 'Feature not found'; end if;
 if exists(select 1 from public.features other where other.id<>target and other.slug=feature.slug and other.status='published' and other.lifecycle_status<>'draft') then raise exception 'A published feature already uses this slug'; end if;
 if nullif(feature.title,'') is null or nullif(feature.slug,'') is null or nullif(feature.summary,'') is null then raise exception 'Title, slug and summary are required before publishing'; end if;
 select coalesce(max(f.strip_position),0)+1 into next_position from public.features f where f.weekly_drop_id=feature.weekly_drop_id and f.status='published';
 update public.features f set status='published',lifecycle_status='open_panel',published_at=coalesce(f.published_at,now()),image=case when nullif(f.image,'') is null or f.image='/assets/koma-vhs-v2.svg' then '/assets/koma-feature-placeholder.svg' else f.image end,image_alt=case when nullif(f.image,'') is null or f.image in ('/assets/koma-vhs-v2.svg','/assets/koma-feature-placeholder.svg') then 'KOMA://PLAY editorial placeholder' else coalesce(nullif(f.image_alt,''),'KOMA://PLAY editorial placeholder') end,strip_position=case when f.strip_position is null or f.strip_position>=999 then next_position else f.strip_position end,updated_at=now() where f.id=target;
 update public.editorial_documents ed set lifecycle_status='published',updated_at=now(),revision_token=gen_random_uuid() where ed.feature_id=target;
 insert into public.editorial_document_snapshots(feature_id,schema_version,document,reason,created_by) values(target,doc.schema_version,doc.working_document,'Published feature',auth.uid());
 return target;
end $$;
revoke all on function public.publish_editorial_panel(uuid) from public,anon,authenticated;
grant execute on function public.publish_editorial_panel(uuid) to authenticated;

-- Accept is an editorial suitability decision only. It no longer publishes.
alter function public.save_contribution(jsonb,uuid) rename to save_contribution_before_four_eyes;
create function public.save_contribution(payload jsonb,contribution_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare current_status text;
begin
 if contribution_id is not null then
  select status into current_status from public.contributions where id=contribution_id and author_id=auth.uid() and withdrawn_at is null;
  if current_status is distinct from 'Changes Requested' then raise exception 'Only a changes-requested contribution can be revised' using errcode='42501'; end if;
 end if;
 return public.save_contribution_before_four_eyes(payload,contribution_id);
end $$;
revoke all on function public.save_contribution_before_four_eyes(jsonb,uuid),public.save_contribution(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid) to authenticated;

create or replace function public.moderate_contribution(target uuid,decision text,published_heading text default '',published_body text default '',note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare c public.contributions;
begin
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 select * into c from public.contributions where id=target for update;
 if c.id is null or c.withdrawn_at is not null or c.status in ('Accepted','Rejected') or c.status=decision or decision not in ('In Review','Changes Requested','Accepted','Rejected') then raise exception 'Invalid status transition'; end if;
 if c.author_id=auth.uid() then raise exception 'Independent review required' using errcode='42501'; end if;
 if length(note)>2000 or (decision in ('Changes Requested','Rejected') and length(trim(note))<4) then raise exception 'A useful moderator note is required'; end if;
 update public.contributions set status=decision,moderator_note=nullif(trim(note),''),moderator_id=auth.uid(),reviewed_at=now(),updated_at=now() where id=target;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id,note) values(target,case when decision='Rejected' then 'Declined' else decision end,c.status,decision,auth.uid(),nullif(trim(note),''));
end $$;
revoke all on function public.moderate_contribution(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.moderate_contribution(uuid,text,text,text,text) to authenticated;

alter table public.contributions add column if not exists incorporated_at timestamptz;

create table if not exists public.contribution_incorporations (
 contribution_id uuid primary key references public.contributions(id),
 feature_id uuid not null references public.features(id),
 heading text not null check(length(trim(heading)) between 4 and 120),
 body text not null check(length(trim(body)) between 20 and 8000),
 editorial_note text not null default '' check(length(editorial_note)<=2000),
 status text not null default 'submitted' check(status in ('submitted','changes_requested','approved','published')),
 prepared_by uuid not null references public.profiles(id),
 submitted_by uuid not null references public.profiles(id),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 published_by uuid references public.profiles(id),
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.contribution_incorporations enable row level security;
revoke all on public.contribution_incorporations from anon,authenticated;

create or replace function public.open_panel_review_inbox()
returns table(contribution_id uuid,feature_id uuid,feature_title text,feature_slug text,author_id uuid,author_display_name text,contribution_type text,title text,body text,source_url text,media_url text,screenshot_path text,status text,moderator_note text,created_at timestamptz,updated_at timestamptz,can_review boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 return query select c.id,c.feature_id,f.title,f.slug,c.author_id,coalesce(nullif(p.display_name,''),'Panelist'),c.type,c.title,c.body,c.source_url,c.media_url,c.screenshot_path,c.status,c.moderator_note,c.created_at,c.updated_at,auth.uid()<>c.author_id
 from public.contributions c join public.features f on f.id=c.feature_id left join public.profiles p on p.id=c.author_id
 where c.withdrawn_at is null and c.status in ('Submitted','In Review','Changes Requested','Accepted') and c.incorporated_at is null
 order by case c.status when 'Submitted' then 0 when 'In Review' then 1 when 'Changes Requested' then 2 else 3 end,c.updated_at;
end $$;

create or replace function public.prepare_contribution_incorporation(target uuid,incorporated_heading text,incorporated_body text,incorporation_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contributions;
begin
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 select * into c from public.contributions where id=target for update;
 if c.id is null or c.status<>'Accepted' or c.withdrawn_at is not null or c.incorporated_at is not null then raise exception 'Accepted contribution not available'; end if;
 if c.author_id=auth.uid() then raise exception 'Independent editorial incorporation required' using errcode='42501'; end if;
 if length(trim(incorporated_heading)) not between 4 and 120 or length(trim(incorporated_body)) not between 20 and 8000 then raise exception 'A complete incorporated heading and body are required'; end if;
 insert into public.contribution_incorporations(contribution_id,feature_id,heading,body,editorial_note,status,prepared_by,submitted_by)
 values(target,c.feature_id,trim(incorporated_heading),trim(incorporated_body),left(coalesce(incorporation_note,''),2000),'submitted',auth.uid(),auth.uid())
 on conflict(contribution_id) do update set heading=excluded.heading,body=excluded.body,editorial_note=excluded.editorial_note,status='submitted',prepared_by=auth.uid(),submitted_by=auth.uid(),reviewed_by=null,reviewed_at=null,updated_at=now();
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id,note) values(target,'Prepared for incorporation','Accepted','Accepted',auth.uid(),nullif(trim(incorporation_note),''));
 return target;
end $$;

create or replace function public.review_contribution_incorporation(target uuid,decision text,review_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contributions; incorporation public.contribution_incorporations; next_status text;
begin
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 if decision='approve' then next_status:='approved'; elsif decision='changes' then next_status:='changes_requested'; else raise exception 'Invalid incorporation review decision'; end if;
 select * into c from public.contributions where id=target;
 select * into incorporation from public.contribution_incorporations where contribution_id=target for update;
 if incorporation.contribution_id is null or incorporation.status not in ('submitted','changes_requested') then raise exception 'Incorporation submission not available'; end if;
 if auth.uid() in (c.author_id,incorporation.prepared_by,incorporation.submitted_by) then raise exception 'Independent review required' using errcode='42501'; end if;
 if next_status='changes_requested' and length(trim(coalesce(review_note,'')))<4 then raise exception 'A useful reviewer note is required'; end if;
 update public.contribution_incorporations set status=next_status,reviewed_by=auth.uid(),reviewed_at=now(),editorial_note=case when next_status='changes_requested' then left(review_note,2000) else editorial_note end,updated_at=now() where contribution_id=target;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id,note) values(target,case when next_status='approved' then 'Incorporation approved' else 'Incorporation changes requested' end,incorporation.status,next_status,auth.uid(),nullif(trim(review_note),''));
 return target;
end $$;

create or replace function public.publish_contribution_incorporation(target uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contributions; incorporation public.contribution_incorporations; addition public.published_additions; revision integer; editor_name text;
begin
 perform public.require_handbook_acceptance();
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 select * into c from public.contributions where id=target for update;
 select * into incorporation from public.contribution_incorporations where contribution_id=target for update;
 if c.id is null or c.status<>'Accepted' or c.incorporated_at is not null or incorporation.status<>'approved' or incorporation.reviewed_by is null then raise exception 'Approved incorporation not available'; end if;
 if incorporation.reviewed_by in (c.author_id,incorporation.prepared_by,incorporation.submitted_by) then raise exception 'Independent approval is required' using errcode='42501'; end if;
 update public.features set current_revision=current_revision+1,updated_at=now() where id=c.feature_id and status='published' returning current_revision into revision;
 if revision is null then raise exception 'Feature is not published'; end if;
 insert into public.published_additions(contribution_id,feature_id,heading,body,target_section,display_order,contributor_id,publishing_moderator,revision_number,screenshot_path,media_url,source_url)
 values(c.id,c.feature_id,incorporation.heading,incorporation.body,c.target_section,revision,c.author_id,auth.uid(),revision,c.screenshot_path,c.media_url,c.source_url) returning * into addition;
 insert into public.revisions(feature_id,revision_number,summary,contributor_ids) values(c.feature_id,revision,'Community contribution incorporated: '||incorporation.heading,array[c.author_id]);
 select display_name into editor_name from public.profiles where id=incorporation.reviewed_by;
 insert into public.panel_citations(contribution_id,feature_id,public_credit,contribution_type,source_url,submitted_at,reviewing_editor,published_at,revision_number,editorial_summary)
 values(c.id,c.feature_id,case when c.public_credit='Anonymous Panelist' then 'Anonymous Panelist' else (select display_name from public.profiles where id=c.author_id) end,c.type,c.source_url,c.created_at,coalesce(editor_name,'KOMA://PLAY editor'),addition.published_at,revision,case when incorporation.editorial_note='' then 'Incorporated into the Community Edition.' else left(incorporation.editorial_note,500) end);
 update public.contributions set incorporated_at=now(),updated_at=now() where id=target;
 update public.contribution_incorporations set status='published',published_by=auth.uid(),published_at=now(),updated_at=now() where contribution_id=target;
 insert into public.moderation_audit(contribution_id,action,previous_status,new_status,actor_id) values(target,'Published incorporation','approved','published',auth.uid());
 return target;
end $$;

create or replace function public.contribution_incorporation_inbox()
returns table(contribution_id uuid,feature_title text,feature_slug text,contribution_title text,contributor_name text,contributor_id uuid,heading text,body text,editorial_note text,status text,prepared_by uuid,submitted_by uuid,reviewed_by uuid,can_review boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.open_panel_role(),'') not in ('moderator','admin') then raise exception 'Moderator access required' using errcode='42501'; end if;
 return query select c.id,f.title,f.slug,c.title,coalesce(nullif(p.display_name,''),'Panelist'),c.author_id,i.heading,i.body,i.editorial_note,i.status,i.prepared_by,i.submitted_by,i.reviewed_by,
  auth.uid()<>c.author_id and auth.uid()<>i.prepared_by and auth.uid()<>i.submitted_by
 from public.contribution_incorporations i join public.contributions c on c.id=i.contribution_id join public.features f on f.id=c.feature_id left join public.profiles p on p.id=c.author_id
 where i.status<>'published' order by i.updated_at;
end $$;

revoke all on function public.open_panel_review_inbox(),public.prepare_contribution_incorporation(uuid,text,text,text),public.review_contribution_incorporation(uuid,text,text),public.publish_contribution_incorporation(uuid),public.contribution_incorporation_inbox() from public,anon,authenticated;
grant execute on function public.open_panel_review_inbox(),public.prepare_contribution_incorporation(uuid,text,text,text),public.review_contribution_incorporation(uuid,text,text),public.publish_contribution_incorporation(uuid),public.contribution_incorporation_inbox() to authenticated;

commit;
