-- Recover only the current authenticated user's absent profile. Existing identity,
-- role, restrictions and preferences must never be replaced during sign-in.
begin;
create function public.bootstrap_member_profile() returns void
language plpgsql security definer set search_path='' as $$
declare account auth.users;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into account from auth.users where id=auth.uid();
 if account.id is null then raise exception 'Account unavailable' using errcode='42501'; end if;
 insert into public.profiles(id,display_name)
 values(account.id,coalesce(nullif(left(trim(account.raw_user_meta_data->>'display_name'),80),''),nullif(left(trim(account.raw_user_meta_data->>'full_name'),80),''),nullif(left(trim(account.raw_user_meta_data->>'name'),80),''),'Reader'))
 on conflict(id) do nothing;
end $$;
revoke all on function public.bootstrap_member_profile() from public,anon,authenticated;
grant execute on function public.bootstrap_member_profile() to authenticated;
commit;
