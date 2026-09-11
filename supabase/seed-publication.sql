-- DEVELOPMENT ONLY, run after seed.sql in the same explicitly opted-in session.
-- October identity uses a relative demonstration clock so active/closing states can be tested on any day.
do $$
declare issue uuid; archive uuid; drops uuid[]; d uuid; n integer; feature uuid; tag uuid;
begin
 if current_setting('open_panel.allow_demo_seed',true) is distinct from 'true' then raise exception 'Development seed requires explicit opt-in';end if;
 if exists(select 1 from public.issues where issue_number=1) then raise exception 'Issue 01 already exists; use a fresh development database';end if;
 select id into archive from public.issues where issue_number=0;
 update public.issues set status='archived',subtitle='DEMO / archived pilot',introduction='Development seed: a lightweight pilot preserved in the archive.',opens_at=now()-interval '60 days',closes_at=now()-interval '30 days',archived_at=now()-interval '29 days' where id=archive;
 insert into public.issues(issue_number,slug,title,subtitle,cover_label,introduction,year,month,status,opens_at,closes_at)
 values(1,'issue-01-october-2026','Issue 01 / October 2026','DEMO / A month in panels','INK//:PLAY / 01','Development data: four weekly frames. Calendar dates are relative to seed time to demonstrate open, closing, final and scheduled content.',2026,10,'current',now()-interval '21 days',now()+interval '12 days') returning id into issue;
 for n in 1..4 loop
 insert into public.weekly_drops(issue_id,week_number,label,introduction,status,scheduled_at,published_at,display_order)
 values(issue,n,(array['First Frame','Second Frame','Third Frame','Final Frame'])[n],'Development demonstration strip.',case when n=4 then 'scheduled' else 'published' end,case when n=4 then now()+interval '2 days' else null end,case when n<4 then now()-make_interval(days=>(4-n)*5) else null end,n) returning id into d;
 drops:=array_append(drops,d);
 end loop;
 update public.features set issue_id=issue,weekly_drop_id=case slug when 'time' then drops[1] when 'afterimage' then drops[2] else drops[3] end,
 lifecycle_status=case when slug in ('time','afterimage') then 'final_panel' when slug='tokon' then 'closing_panel' else 'open_panel' end,
 deadline_override=case when slug in ('time','afterimage') then now()-interval '1 day' when slug='tokon' then now()+interval '2 days' else null end,
 finalised_at=case when slug in ('time','afterimage') then now()-interval '1 day' else null end,
 summary=case slug when 'time' then 'What should a faithful remake remember?' when 'vice' then 'The industry waiting in its shadow.' when 'tokon' then 'A true beginner’s guide to Tōkon.' else 'Why the OVA look keeps returning.' end
 where slug in ('time','vice','tokon','afterimage');
 insert into public.features(slug,title,status,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,summary,editorial_body,image,image_alt,panel_class)
 values('manga-margin','READ BETWEEN THE PANELS','published',issue,drops[2],2,(select id from public.categories where slug='manga'),(select id from public.content_formats where slug='discovery'),'open_panel','A reading notebook for the page between actions.','DEVELOPMENT EXAMPLE. Follow the spacing between panels and notice how it shapes the time you imagine passing. This placeholder is an in-house editorial prompt, not a report about a real release.','/assets/clue-vhs.png','An INK//:PLAY archive tape used as an editorial placeholder','vhs') returning id into feature;
 insert into public.revisions(feature_id,revision_number,summary) values(feature,1,'Development seed: original editorial prompt.');
 insert into public.features(slug,title,status,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,summary,editorial_body,image,image_alt,panel_class)
 values('tokon-next-session','THE NEXT PRACTICE SESSION','published',issue,drops[4],1,(select id from public.categories where slug='gaming'),(select id from public.content_formats where slug='guide'),'open_panel','A scheduled follow-up to the beginner’s notebook.','DEVELOPMENT EXAMPLE. A future panel ready for the fourth weekly drop. It remains private until that drop is intentionally published or its scheduled time is reconciled.','/assets/clue-shield.png','A gouged shield','tokon') returning id into feature;
 insert into public.feature_relationships(feature_id,related_id,kind) select feature,id,'continues_from' from public.features where slug='tokon';
 insert into public.revisions(feature_id,revision_number,summary) values(feature,1,'Development seed: scheduled editorial.');
 insert into public.features(slug,title,status,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,summary,image,image_alt)
 values('draft-practice-notes','A NOTE FOR NEXT MONTH','draft',issue,drops[4],2,(select id from public.categories where slug='culture'),(select id from public.content_formats where slug='essay'),'draft','An unpublished feature to carry into the next issue.','/assets/clue-ocarina.png','A worn ocarina');
 insert into public.features(slug,title,status,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,summary,editorial_body,image,image_alt,panel_class,finalised_at,archived_at,published_at)
 values('demo-the-painted-frame','THE PAINTED FRAME','published',archive,(select id from public.weekly_drops where issue_id=archive limit 1),1,(select id from public.categories where slug='anime'),(select id from public.content_formats where slug='essay'),'archived','Development archive: the texture of painted backgrounds.','DEVELOPMENT ARCHIVE EXAMPLE. This finished panel is preserved with a closed Workshop. Later observations belong in a new feature; factual concerns use a private correction report.','/assets/clue-vhs.png','A worn INK//:PLAY VHS tape','vhs',now()-interval '30 days',now()-interval '29 days',now()-interval '35 days') returning id into feature;
 update public.weekly_drops set published_at=now()-interval '35 days' where issue_id=archive;
 insert into public.revisions(feature_id,revision_number,summary) values(feature,1,'Development archive: final original edition.');
 insert into public.tags(name,slug,kind) values('Tōkon','tokon','franchise'),('Fighting Games','fighting-games','genre'),('PlayStation','playstation','platform'),('Retro Anime','retro-anime','subject'),('1980s','1980s','era'),('Beginner Guides','beginner-guides','subject');
 insert into public.feature_tags(feature_id,tag_id) select f.id,t.id from public.features f cross join public.tags t where (f.slug like 'tokon%' and t.slug in ('tokon','fighting-games','beginner-guides')) or (f.slug in ('afterimage','demo-the-painted-frame') and t.slug in ('retro-anime','1980s'));
end $$;
