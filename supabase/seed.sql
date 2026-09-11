-- DEVELOPMENT ONLY. Explicit opt-in, no real user IDs, passwords, or admin emails.
-- In the SQL editor or psql, run: SET open_panel.allow_demo_seed = 'true';
-- Then execute this file in the same session. Never use this seed in production.
do $$
declare moderator uuid; author uuid; feature uuid; contribution uuid; i integer;
begin
 if current_setting('open_panel.allow_demo_seed',true) is distinct from 'true' then raise exception 'Development seed requires explicit open_panel.allow_demo_seed=true'; end if;
 if exists(select 1 from auth.users where email like 'open-panel-demo-%@example.test') then raise exception 'Demo seed already exists; use a fresh development project'; end if;
 if to_regclass('public.issues') is not null then
 execute 'update public.issues set opens_at=now()-interval ''1 day'',closes_at=now()+interval ''30 days'' where issue_number=0 and status=''current''';
 execute 'update public.weekly_drops set published_at=now()-interval ''1 hour'' where status=''published''';
 execute 'update public.features set published_at=now()-interval ''1 hour'' where status=''published''';
 end if;
 moderator:=gen_random_uuid();
 insert into auth.users(id,email,raw_user_meta_data) values(moderator,'open-panel-demo-editor@example.test','{"display_name":"Demo editor"}');
 update public.profiles set role='moderator' where id=moderator;
 if to_regclass('public.handbook_acceptances') is not null then
   insert into public.handbook_acceptances(user_id,handbook_version_id,statement_version) select moderator,id,statement_version from public.handbook_versions where active;
 end if;
 select id into feature from public.features where slug='tokon';
 for i in 1..5 loop
 author:=gen_random_uuid();
 insert into auth.users(id,email,raw_user_meta_data) values(author,'open-panel-demo-'||i||'@example.test',jsonb_build_object('display_name',(array['Kai','Mina','Ren','Aki','Jo'])[i]));
 if to_regclass('public.handbook_acceptances') is not null then
   insert into public.handbook_acceptances(user_id,handbook_version_id,statement_version) select author,id,statement_version from public.handbook_versions where active;
 end if;
 perform set_config('request.jwt.claim.sub',author::text,true);
 contribution:=public.save_contribution(jsonb_build_object('feature_id',feature,'type','Tip','target_section','Practice','title',(array['Start with one reliable action','Practice with a purpose','Notice what went wrong','Make room for assists','Keep a small practice notebook'])[i],'body',(array['Choose one action you can repeat reliably. Use practice time to notice when it succeeds and when you need a different response.','Give each practice session one question. Test your answer before adding another task to the session.','After a difficult match, identify one decision to revisit. Turn that observation into your next practice goal.','Spend a short session exploring assists on their own, then consider where they support the decisions you already understand.','Write down one discovery after practice. Return to it next time and check whether it still helps.'])[i]));
 perform set_config('request.jwt.claim.sub',moderator::text,true);
 perform public.moderate_contribution(contribution,'Accepted',(select title from public.contributions where id=contribution),(select body from public.contributions where id=contribution),'Development example: reviewed for clarity.');
 end loop;
 perform set_config('request.jwt.claim.sub',author::text,true);
 contribution:=public.save_contribution(jsonb_build_object('feature_id',feature,'type','Strategy','target_section','Choosing a fighter','title','Build a first-week practice plan','body','Try a short daily practice plan focused on one fighter and record the situations that remain confusing.'));
 contribution:=public.save_contribution(jsonb_build_object('feature_id',feature,'type','Correction','target_section','Overview','title','Clarify the guide’s starting assumptions','body','Please clarify which control scheme the introductory advice assumes, so beginners can compare it with their setup.'));
 perform set_config('request.jwt.claim.sub',moderator::text,true);
 perform public.moderate_contribution(contribution,'In Review','','','Checking the original section.');
 perform set_config('request.jwt.claim.sub',author::text,true);
 contribution:=public.save_contribution(jsonb_build_object('feature_id',feature,'type','Example','target_section','Assists','title','An assist timing example','body','This example could explain when I use an assist, but I still need to provide a repeatable situation and clear steps.'));
 perform set_config('request.jwt.claim.sub',moderator::text,true);
 perform public.moderate_contribution(contribution,'Changes Requested','','','Please add a repeatable situation and specific steps.');
 perform set_config('request.jwt.claim.sub','',true);
end $$;
