-- The public Community Edition and private feature Workshop share one canonical feature.
alter table public.profiles add column account_status text not null default 'active' check(account_status in ('active','restricted','suspended'));
alter table public.contributions add column public_credit text not null default 'Anonymous Panelist' check(public_credit in ('Anonymous Panelist','Display name','Pen name'));
alter table public.contributions add column publication_consent boolean not null default true;
create table public.panel_citations (
 id uuid primary key default gen_random_uuid(), contribution_id uuid not null unique references public.contributions(id), feature_id uuid not null references public.features(id),
 public_credit text not null, contribution_type text not null, source_url text not null default '', submitted_at timestamptz not null,
 reviewing_editor text not null, published_at timestamptz not null default now(), revision_number integer not null, editorial_summary text not null check(length(editorial_summary) between 4 and 500)
);
alter table public.panel_citations enable row level security;
create policy public_panel_citations on public.panel_citations for select using(exists(select 1 from public.published_additions a join public.features f on f.id=a.feature_id where a.contribution_id=panel_citations.contribution_id and f.status='published'));
revoke all on public.panel_citations from anon,authenticated;
grant select on public.panel_citations to anon,authenticated;
insert into public.panel_citations(contribution_id,feature_id,public_credit,contribution_type,source_url,submitted_at,reviewing_editor,published_at,revision_number,editorial_summary)
select a.contribution_id,a.feature_id,case when c.public_credit='Anonymous Panelist' then 'Anonymous Panelist' else p.display_name end,c.type,c.source_url,c.created_at,'INK//:PLAY editor',a.published_at,a.revision_number,'Curated for the Community Edition.'
from public.published_additions a join public.contributions c on c.id=a.contribution_id join public.profiles p on p.id=a.contributor_id on conflict(contribution_id) do nothing;
alter function public.save_contribution(jsonb,uuid) rename to save_contribution_before_consent;
create function public.save_contribution(payload jsonb,contribution_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; credit text;
begin
 perform public.require_handbook_acceptance();
 if coalesce((payload->>'publication_consent')::boolean,false) is not true then raise exception 'Publication consent is required' using errcode='42501'; end if;
 credit:=coalesce(payload->>'public_credit',''); if credit not in ('Anonymous Panelist','Display name','Pen name') then raise exception 'Choose a public credit preference'; end if;
 result:=public.save_contribution_before_consent(payload,contribution_id);
 update public.contributions set public_credit=credit,publication_consent=true where id=result and author_id=auth.uid(); return result;
end $$;
revoke all on function public.save_contribution_before_consent(jsonb,uuid),public.save_contribution(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_contribution(jsonb,uuid) to authenticated;
alter function public.moderate_contribution(uuid,text,text,text,text) rename to moderate_contribution_before_citation;
create function public.moderate_contribution(target uuid,decision text,published_heading text default '',published_body text default '',note text default '') returns void language plpgsql security definer set search_path='' as $$
declare c public.contributions; a public.published_additions; editor_name text;
begin
 perform public.require_handbook_acceptance(); perform public.moderate_contribution_before_citation(target,decision,published_heading,published_body,note);
 if decision='Accepted' then select * into c from public.contributions where id=target; select * into a from public.published_additions where contribution_id=target; select display_name into editor_name from public.profiles where id=auth.uid();
 insert into public.panel_citations(contribution_id,feature_id,public_credit,contribution_type,source_url,submitted_at,reviewing_editor,published_at,revision_number,editorial_summary) values(target,c.feature_id,case when c.public_credit='Anonymous Panelist' then 'Anonymous Panelist' else (select display_name from public.profiles where id=c.author_id) end,c.type,c.source_url,c.created_at,coalesce(editor_name,'INK//:PLAY editor'),a.published_at,a.revision_number,case when note='' then 'Accepted for the Community Edition.' else left(note,500) end) on conflict(contribution_id) do nothing; end if;
end $$;
revoke all on function public.moderate_contribution_before_citation(uuid,text,text,text,text),public.moderate_contribution(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.moderate_contribution(uuid,text,text,text,text) to authenticated;
