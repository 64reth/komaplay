-- Admin user directory. Permission writes continue to use the existing audited
-- manage_editorial_grant() and grant_open_panel_role() security-definer RPCs.
create or replace function public.admin_member_directory(search_term text default '',role_filter text default 'all',status_filter text default 'all',sort_order text default 'newest',page_limit integer default 25,page_offset integer default 0)
returns table(user_id uuid,email text,display_name text,role text,account_status text,joined_at timestamptz,editorial_access boolean,legacy_review_grant boolean,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.account_status='active') then raise exception 'Administrator access required' using errcode='42501'; end if;
 if role_filter not in ('all','member','contributor','editor','moderator','admin','missing-profile') or status_filter not in ('all','active','restricted','suspended') or sort_order not in ('newest','oldest','name','role') then raise exception 'Invalid directory filter'; end if;
 return query
 with directory as (
  select p.id,u.email,p.display_name,p.role,p.account_status,p.created_at,
   exists(select 1 from public.editorial_access_grants g where g.user_id=p.id and g.access_level='editor' and g.revoked_at is null) is_editor,
   exists(select 1 from public.editorial_access_grants g where g.user_id=p.id and g.access_level='administrator' and g.revoked_at is null) has_legacy_review
  from public.profiles p join auth.users u on u.id=p.id
 ), filtered as (
  select * from directory d where (trim(search_term)='' or d.display_name ilike '%'||trim(search_term)||'%' or coalesce(d.email,'') ilike '%'||trim(search_term)||'%' or d.id::text ilike '%'||trim(search_term)||'%')
   and (status_filter='all' or d.account_status=status_filter)
   and case role_filter when 'all' then true when 'editor' then d.is_editor when 'missing-profile' then trim(d.display_name)='' or d.display_name='Reader' else d.role=role_filter end
 )
 select f.id,f.email,f.display_name,f.role,f.account_status,f.created_at,f.is_editor,f.has_legacy_review,count(*) over()
 from filtered f order by case when sort_order='newest' then f.created_at end desc,case when sort_order='oldest' then f.created_at end asc,case when sort_order='name' then lower(f.display_name) end asc,case when sort_order='role' then f.role end asc,f.id
 limit greatest(1,least(page_limit,50)) offset greatest(page_offset,0);
end $$;
revoke all on function public.admin_member_directory(text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_member_directory(text,text,text,text,integer,integer) to authenticated;
