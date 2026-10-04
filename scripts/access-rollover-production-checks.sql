begin;
set local statement_timeout='45s';
set local lock_timeout='3s';
do $$
declare actor uuid; member_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); fid uuid:=gen_random_uuid(); hidden_id uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); selected_id uuid:=gen_random_uuid(); rejected_id uuid:=gen_random_uuid(); v public.handbook_versions; source text; destination text; y integer; n integer; snapshot_count integer; chosen text; unchosen text;
begin
 select p.id into strict actor from public.profiles p where p.role='admin' and p.account_status='active' and exists(select 1 from public.handbook_acceptances a join public.handbook_versions h on h.id=a.handbook_version_id and h.active where a.user_id=p.id and a.statement_version=h.statement_version) limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into auth.users(id,email,raw_user_meta_data) values(member_id,'rollover-'||member_id||'@example.invalid','{}'),(other_id,'rollover-'||other_id||'@example.invalid','{}');
 select * into strict v from public.handbook_versions where active;
 perform set_config('request.jwt.claim.sub',member_id::text,true);set local role authenticated;perform public.accept_handbook(v.id,v.content_hash,v.statement_version,true);
 begin perform public.set_member_access_level(other_id,'admin',true);raise exception 'Member granted Admin';exception when insufficient_privilege then null;end;
 begin perform public.run_issue_rollover();raise exception 'Member ran scheduler';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 begin perform public.set_member_access_level(actor,'member',true);raise exception 'Self lockout';exception when insufficient_privilege then null;end;
 begin perform public.set_member_access_level(member_id,'editor',false);raise exception 'Unconfirmed elevation';exception when insufficient_privilege then null;end;
 foreach source in array array['member','editor','moderator','admin'] loop
  foreach destination in array array['member','editor','moderator','admin'] loop
   perform public.set_member_access_level(member_id,source,true);
   perform public.set_member_access_level(member_id,destination,true);
   if (select role from public.profiles where id=member_id)<>(case when destination='editor' then 'member' else destination end) then raise exception 'Wrong site role';end if;
   if public.editorial_has_access(member_id,false) is distinct from (destination<>'member') then raise exception 'Wrong editorial access';end if;
   if public.editorial_has_access(member_id,true) is distinct from (destination in ('moderator','admin')) then raise exception 'Wrong review authority';end if;
  end loop;
 end loop;
 reset role;
 insert into public.editorial_access_grants(user_id,access_level,granted_by) values(member_id,'administrator',actor);
 set local role authenticated;perform public.set_member_access_level(member_id,'editor',true);
 if public.editorial_has_access(member_id,true) then raise exception 'Legacy review survived downgrade';end if;
 perform public.set_member_access_level(member_id,'member',true);
 reset role;
 select x into y from generate_series(2000,2020) x where not exists(select 1 from public.issues where year=x and month=1) limit 1;
 insert into public.issues(id,issue_number,slug,title,year,month,status,opens_at,closes_at,created_by,cover_art,cover_art_alt,lead_headline)
 values(iid,(select max(issue_number)+10000 from public.issues),'rollover-'||iid,'Rollback-only monthly Issue',y,1,'finalising',make_timestamptz(y,1,1,0,0,0,'UTC'),make_timestamptz(y,2,1,0,0,0,'UTC'),actor,'/assets/koma-feature-placeholder.svg','Fixture cover','Fixture lead');
 insert into public.weekly_drops(id,issue_id,week_number,label,status,published_at) values(did,iid,1,'Rollback fixture','published',now());
 insert into public.features(id,issue_id,weekly_drop_id,slug,title,status,lifecycle_status) values(fid,iid,did,'rollover-'||fid,'Rollback-only published Panel','published','open_panel'),(hidden_id,iid,did,'rollover-'||hidden_id,'Private taken-down Panel','published','taken_down');
 insert into public.editorial_documents(feature_id,author_id,schema_version,working_document,lifecycle_status) values(fid,actor,1,'{"schemaVersion":1,"modules":[]}','published');
 select count(*) into n from public.issues;
 perform public.run_issue_rollover();
 if not exists(select 1 from public.issue_rollover where issue_id=iid and phase='needs_editorial' and message like 'Issue is waiting for a valid submitted cover%') then raise exception 'Missing submitted cover not surfaced';end if;
 -- Only the calendar identity is a time gate.
 update public.issues set closes_at=make_timestamptz(y,2,1,0,0,0,'UTC'),year=2199 where id=iid;
 perform public.run_issue_rollover();
 if exists(select 1 from public.issues where id=iid and status='archived') then raise exception 'Future month archived';end if;
 update public.issues set year=y where id=iid;
 -- Selected cover becomes public only at archive; non-selected artwork stays private.
 chosen:='cover-pool/'||actor||'/'||gen_random_uuid()||'.png';unchosen:='cover-pool/'||actor||'/'||gen_random_uuid()||'.png';
 insert into storage.objects(bucket_id,name,owner_id) values('issue-cover-pool',chosen,actor::text),('issue-cover-pool',unchosen,actor::text);
 insert into public.issue_cover_candidates(id,issue_id,created_by,payload,status,selected_at,submitted_at) values(selected_id,iid,actor,jsonb_build_object('cover_art',chosen,'cover_art_alt','Fixture cover','lead_headline','Fixture headline','cover_preset','minimal','secondary_cover_lines','[]'::jsonb),'selected',now(),now()),(rejected_id,iid,actor,jsonb_build_object('cover_art',unchosen),'not-selected',null,now());
 update public.issues set cover_art=chosen where id=iid;
 update public.features set deadline_override=null where id=fid;
 set local timezone='Pacific/Honolulu';perform public.run_issue_rollover();
 if not exists(select 1 from public.issues where id=iid and status='archived') or not exists(select 1 from public.features where id=fid and lifecycle_status='archived') then raise exception 'Issue did not archive: %',(select message from public.issue_rollover where issue_id=iid);end if;
 if not exists(select 1 from public.features where id=hidden_id and lifecycle_status='taken_down') then raise exception 'Taken-down Panel exposed';end if;
 select count(*) into snapshot_count from public.editorial_document_snapshots where feature_id=fid;
 perform public.run_issue_rollover();
 if (select count(*) from public.editorial_document_snapshots where feature_id=fid)<>snapshot_count or (select count(*) from public.issue_cover_audit where issue_id=iid and action='archive-validated')<>1 then raise exception 'Retry duplicated archive';end if;
 if (select count(*) from public.issues)<>n then raise exception 'Scheduler invented an Issue';end if;
 if not public.cover_pool_image_public(chosen) or public.cover_pool_image_public(unchosen) then raise exception 'Wrong cover published';end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);set local role authenticated;
 if exists(select 1 from public.issue_rollover where issue_id=iid) then raise exception 'Member read rollover provenance';end if;
 begin perform public.confirm_issue_rollover(iid,true);raise exception 'Member confirmed cover';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);set local role anon;
 begin perform count(*) from public.issue_rollover;raise exception 'Rollover state public';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.public_issues where id=iid and status='archived' and cover_art like '/api/public-media/%') then raise exception 'Archive cover projection unavailable';end if;
 if not exists(select 1 from public.public_features where id=fid) or exists(select 1 from public.public_features where id=hidden_id) then raise exception 'Archive Panel projection wrong';end if;
 reset role;
end $$;
rollback;
select 'PASS: all 16 access-level transitions, real grants, confirmation/self-lockout, legacy review downgrade; missing submitted cover, future calendar month, optional lead, UTC archive, retries, selected-only cover, private operational state and browsable archive. All fixtures rolled back.' as result;
