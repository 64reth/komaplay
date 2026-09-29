-- Additive private identity/preferences and editorial desk tray. Public projections stay unchanged.
alter table public.profiles add column preferences_chosen_at timestamptz;
create function public.validate_broad_interests() returns trigger language plpgsql set search_path='' as $$
begin
 if new.interests is distinct from old.interests and (cardinality(new.interests)>4 or not new.interests <@ array['gaming','anime','culture','manga']::text[] or array_position(new.interests,null) is not null) then raise exception 'Choose Gaming, Anime, Culture or Manga' using errcode='22023';end if;
 return new;
end $$;
create trigger broad_interest_guard before update of interests on public.profiles for each row execute function public.validate_broad_interests();
create function public.set_member_preferences(choices text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_handbook_acceptance();
 if choices is null or cardinality(choices)>4 or not choices <@ array['gaming','anime','culture','manga']::text[] or array_position(choices,null) is not null then raise exception 'Invalid category preferences' using errcode='22023';end if;
 update public.profiles set interests=array(select distinct x from unnest(choices) x order by x),preferences_chosen_at=now() where id=auth.uid();
end $$;

create table public.member_inbox (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 event_key text not null, kind text not null check(kind in ('status','response','incorporated','cited','published','editorial')),
 feature_id uuid not null references public.features(id), contribution_id uuid references public.contributions(id),
 message text not null check(length(message)<=600), created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,event_key)
);
create index member_inbox_recent on public.member_inbox(user_id,created_at desc,id);
alter table public.member_inbox enable row level security;
revoke all on public.member_inbox from public,anon,authenticated;
grant select on public.member_inbox to authenticated;
create policy inbox_own_read on public.member_inbox for select to authenticated using(user_id=auth.uid() and public.has_current_handbook_acceptance() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active'));
create function public.deliver_editorial_event(recipient uuid,event text,event_kind text,feature uuid,contribution uuid,copy text) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Private transactional outbox, not callable by clients. No historical backfill or public feed.
 perform pg_advisory_xact_lock(hashtextextended(recipient::text,7));
 insert into public.member_inbox(user_id,event_key,kind,feature_id,contribution_id,message) values(recipient,event,event_kind,feature,contribution,left(copy,600)) on conflict(user_id,event_key) do nothing;
 -- Retain event keys/read state for durable deduplication; the desk tray returns a finite 50.
end $$;
create function public.capture_contribution_feedback() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status in ('In Review','Changes Requested','Accepted','Rejected') then
 perform public.deliver_editorial_event(new.author_id,'status:'||new.id||':'||new.status||':'||md5(coalesce(new.moderator_note,'')),'status',new.feature_id,new.id,case new.status when 'Accepted' then 'Contribution accepted. Incorporation and publication are separate editorial steps.' when 'Rejected' then 'Contribution declined. Your private Workshop has the editorial decision.' when 'Changes Requested' then 'Changes requested. Continue your contribution in the Workshop.' else 'Your contribution is being reviewed.' end);
 end if;
 if nullif(trim(new.moderator_note),'') is not null and new.moderator_note is distinct from old.moderator_note then
 perform public.deliver_editorial_event(new.author_id,'response:'||new.id||':'||md5(new.moderator_note),'response',new.feature_id,new.id,'Editorial response: '||left(new.moderator_note,560));end if;
 if new.incorporated_at is not null and old.incorporated_at is null then
 perform public.deliver_editorial_event(new.author_id,'incorporated:'||new.id,'incorporated',new.feature_id,new.id,'Your contribution was incorporated. Check its current publication status on Profile.');end if;
 return new;
end $$;
create trigger contribution_feedback after update of status,moderator_note,incorporated_at on public.contributions for each row execute function public.capture_contribution_feedback();
create function public.capture_citation_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select author_id into recipient from public.contributions where id=new.contribution_id;
 perform public.deliver_editorial_event(recipient,'cited:'||new.contribution_id,'cited',new.feature_id,new.contribution_id,'A Panel Citation recognises your contribution. Profile shows whether the resulting work is currently public.');
 if public.feature_is_public(new.feature_id) then perform public.deliver_editorial_event(recipient,'published:'||new.contribution_id,'published',new.feature_id,new.contribution_id,'Work containing your contribution is published. Read the resulting panel.');end if;
 return new;
end $$;
create trigger citation_feedback after insert on public.panel_citations for each row execute function public.capture_citation_feedback();
create function public.capture_editorial_feedback() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.lifecycle_status is distinct from old.lifecycle_status and new.lifecycle_status in ('changes_requested','approved') then
 perform public.deliver_editorial_event(new.author_id,'editorial:'||new.feature_id||':'||new.lifecycle_status||':'||new.revision_token,'editorial',new.feature_id,null,case new.lifecycle_status when 'changes_requested' then 'Editorial changes requested. Open your panel to read the reviewer response.' when 'approved' then 'Your panel passed independent review. It is ready for publication.' else 'Your panel has been published.' end);end if;
 if new.lifecycle_status='published' and public.feature_is_public(new.feature_id) then perform public.deliver_editorial_event(new.author_id,'editorial-published:'||new.feature_id,'published',new.feature_id,null,'Your panel is published. Read it in the Issue.');end if;
 return new;
end $$;
create trigger editorial_feedback after update of lifecycle_status on public.editorial_documents for each row execute function public.capture_editorial_feedback();
-- Publication/visibility changes can occur separately from incorporation.
create function public.capture_feature_publication_feedback() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if public.feature_is_public(new.id) then
 for item in select c.id,c.author_id from public.contributions c join public.published_additions a on a.contribution_id=c.id where a.feature_id=new.id loop
 perform public.deliver_editorial_event(item.author_id,'published:'||item.id,'published',new.id,item.id,'Work containing your contribution is published. Read the resulting panel.');end loop;
 end if;return new;
end $$;
create trigger feature_publication_feedback after update of status,lifecycle_status,published_at on public.features for each row execute function public.capture_feature_publication_feedback();
create function public.set_inbox_read(target uuid,seen boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform public.require_handbook_acceptance();
 update public.member_inbox set read_at=case when seen then coalesce(read_at,now()) else null end where id=target and user_id=auth.uid();
 return found;
end $$;
create function public.my_editorial_publications() returns table(feature_id uuid,published_at timestamptz) language sql stable security definer set search_path='' as $$
 select f.id,f.published_at from public.editorial_documents ed join public.features f on f.id=ed.feature_id where ed.author_id=auth.uid() and public.feature_is_public(f.id) and public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') order by f.published_at desc
$$;
revoke all on function public.validate_broad_interests(),public.deliver_editorial_event(uuid,text,text,uuid,uuid,text),public.capture_contribution_feedback(),public.capture_citation_feedback(),public.capture_editorial_feedback(),public.capture_feature_publication_feedback(),public.set_inbox_read(uuid,boolean),public.set_member_preferences(text[]),public.my_editorial_publications() from public,anon,authenticated;
grant execute on function public.set_inbox_read(uuid,boolean),public.set_member_preferences(text[]),public.my_editorial_publications() to authenticated;
-- Reconcile scheduled/drop/Issue publication on the member's next visit, without a public polling feed.
create function public.my_editorial_inbox() returns setof public.member_inbox language plpgsql security definer set search_path='' as $$
declare item record;
begin
 perform public.require_handbook_acceptance();
 for item in select c.id,c.feature_id from public.contributions c join public.published_additions a on a.contribution_id=c.id where c.author_id=auth.uid() and public.feature_is_public(a.feature_id) loop
 perform public.deliver_editorial_event(auth.uid(),'published:'||item.id,'published',item.feature_id,item.id,'Work containing your contribution is published. Read the resulting panel.');end loop;
 for item in select ed.feature_id from public.editorial_documents ed where ed.author_id=auth.uid() and ed.lifecycle_status='published' and public.feature_is_public(ed.feature_id) loop
 perform public.deliver_editorial_event(auth.uid(),'editorial-published:'||item.feature_id,'published',item.feature_id,null,'Your panel is published. Read it in the Issue.');end loop;
 return query select * from public.member_inbox where user_id=auth.uid() order by created_at desc,id desc limit 50;
end $$;
revoke all on function public.my_editorial_inbox() from public,anon,authenticated;
grant execute on function public.my_editorial_inbox() to authenticated;

-- Earned private recognition survives a panel becoming unavailable; this does not make it public.
create function public.my_citation_history() returns table(contribution_id uuid,feature_id uuid,recognised_at timestamptz) language sql stable security definer set search_path='' as $$
 select pc.contribution_id,pc.feature_id,pc.published_at from public.panel_citations pc join public.contributions c on c.id=pc.contribution_id where c.author_id=auth.uid() and public.has_current_handbook_acceptance() and exists(select 1 from public.profiles where id=auth.uid() and account_status='active') order by pc.published_at desc
$$;
revoke all on function public.my_citation_history() from public,anon,authenticated;
grant execute on function public.my_citation_history() to authenticated;
