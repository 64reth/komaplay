import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor='00000000-0000-4000-8000-000000000099';
test('continuous monthly Issue lifecycle',async(t)=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text default auth.uid()::text);
   alter table storage.objects enable row level security;grant select,insert on storage.objects to anon,authenticated;
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
   if(file==='202609110009_koma_handbook_panel_repair.sql') await db.exec(`insert into auth.users(id) values('${actor}');update profiles set role='admin' where id='${actor}'`);
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  }
  await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);select accept_handbook(id,content_hash,statement_version,true) from handbook_versions where active;select set_config('request.jwt.claim.sub','',false);`);
  const issue=async(year=2000)=>{
   const id=crypto.randomUUID();
   await db.query(`insert into issues(id,issue_number,slug,title,year,month,status,opens_at,closes_at,created_by) values($1,9999,$2,'Rollover test',$3,1,'finalising','2000-01-01',now()+interval '1 year',$4)`,[id,'rollover-'+id,year,actor]);return id;
  };
  const candidate=async(i:string,status='submitted')=>{
   const id=crypto.randomUUID(),art=`cover-pool/${actor}/${id}.png`;
   await db.query(`insert into storage.objects(bucket_id,name,owner_id) values('issue-cover-pool',$1,$2)`,[art,actor]);
   const p={cover_art:art,cover_art_alt:'Saved drawing',lead_headline:'Issue cover',lead_feature_id:'',secondary_cover_lines:[],cover_preset:'minimal'};
   await db.query(`insert into issue_cover_candidates(id,issue_id,created_by,status,submitted_at,payload) values($1,$2,$3,$4,case when $4='draft' then null else now() end,$5)`,[id,i,actor,status,JSON.stringify(p)]);return {id,art};
  };
  const run=async()=>{await db.exec("select set_config('request.jwt.claim.sub','',false);set role service_role;select run_issue_rollover();reset role");};
  const status=async(i:string)=>(await db.query<{status:string}>(`select status from issues where id=$1`,[i])).rows[0].status;
  const check=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec("begin;update issues set status='finalising' where status='current'");try{await fn();}finally{await db.exec('rollback;reset role');}});
  const close=async(i:string)=>{await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated`);const result=(await db.query<{result:{status:string;nextIssue:{id:string;number:number;month:number;year:number;status:string};step?:string}}>('select close_issue($1) result',[i])).rows[0].result;await db.exec('reset role');return result;};
  await check('normal archive opens exactly one empty next monthly Issue and first draft container',async()=>{const i=await issue();await candidate(i);const result=await close(i);assert.equal(result.status,'ARCHIVED');assert.equal(result.nextIssue.number,10000);assert.equal(result.nextIssue.month,2);assert.equal(result.nextIssue.status,'current');assert.equal((await db.query('select * from features where issue_id=$1',[result.nextIssue.id])).rows.length,0);assert.equal((await db.query('select * from issue_cover_candidates where issue_id=$1',[result.nextIssue.id])).rows.length,0);assert.deepEqual((await db.query('select status,week_number from weekly_drops where issue_id=$1',[result.nextIssue.id])).rows,[{status:'draft',week_number:1}]);});
  await check('first editorial draft defaults to the new current Issue',async()=>{const i=await issue(2030);await candidate(i);const result=await close(i);await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated`);const saved=(await db.query<{id:string}>('select save_editorial_draft($1) id',[{title:'First draft',slug:'first-monthly-draft',summary:'',document:{schemaVersion:1,modules:[]},status:'draft'}])).rows[0].id;await db.exec('reset role');assert.equal((await db.query<{issue_id:string}>('select issue_id from features where id=$1',[saved])).rows[0].issue_id,result.nextIssue.id);});
  await check('retry and scheduler converge without duplicate numbering or monthly containers',async()=>{const i=await issue();await candidate(i);const first=await close(i);const again=await close(i);assert.equal(again.status,'ALREADY_ARCHIVED');assert.equal(first.nextIssue.id,again.nextIssue.id);await run();assert.equal((await db.query('select * from issues where year=2000 and month=2')).rows.length,1);});
  await check('prepared next Issue is reused without overwriting editorial metadata or dates',async()=>{const i=await issue();await candidate(i);const next=crypto.randomUUID();await db.query("insert into issues(id,issue_number,slug,title,year,month,opens_at,closes_at) values($1,10000,'prepared-february','Prepared title',2000,2,'2000-02-02','2000-03-02')",[next]);const result=await close(i);assert.equal(result.nextIssue.id,next);assert.equal((await db.query<{title:string}>('select title from issues where id=$1',[next])).rows[0].title,'Prepared title');});
  await check('interruption after archive recovers through the same canonical operation',async()=>{const i=await issue();await candidate(i);await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false)`);await db.query('select close_issue_archive_internal($1)',[i]);assert.equal(await status(i),'archived');assert.equal((await db.query('select * from issues where year=2000 and month=2')).rows.length,0);await run();assert.equal((await db.query<{status:string}>('select status from issues where year=2000 and month=2')).rows[0].status,'current');});
  await check('successor failure preserves archive, exposes the failed step, and safely retries',async()=>{const i=await issue();await candidate(i);await db.exec("alter table issues add constraint simulate_next_failure check(issue_number<>10000) not valid");const failed=await close(i);assert.equal(failed.status,'FAILED');assert.equal(failed.step,'activate-next-issue');assert.equal(await status(i),'archived');await db.exec('alter table issues drop constraint simulate_next_failure');assert.equal((await close(i)).nextIssue.status,'current');});
  await check('December to January uses UTC calendar boundaries',async()=>{const i=await issue();await db.query('update issues set year=2030,month=12 where id=$1',[i]);await candidate(i);await db.exec("set timezone='Pacific/Honolulu'");const result=await close(i);assert.equal(result.nextIssue.year,2031);assert.equal(result.nextIssue.month,1);assert.equal((await db.query<{start:string}>("select to_char(opens_at at time zone 'UTC','YYYY-MM-DD HH24:MI') start from issues where id=$1",[result.nextIssue.id])).rows[0].start,'2031-01-01 00:00');});
  await check('archived parent rejects fresh contributions even if child still appears open',async()=>{const i=await issue(),drop=crypto.randomUUID(),f=crypto.randomUUID();await candidate(i);await db.query("insert into weekly_drops(id,issue_id,week_number,label,status,published_at) values($1,$2,1,'Week 1','published',now())",[drop,i]);await db.query("insert into features(id,issue_id,weekly_drop_id,slug,title,status,lifecycle_status) values($1,$2,$3,$4,'Public Panel','published','open_panel')",[f,i,drop,'panel-'+f]);await close(i);await db.query("update features set lifecycle_status='open_panel',deadline_override=now()+interval '1 year' where id=$1",[f]);assert.equal((await db.query<{allowed:boolean}>('select feature_accepts_contributions($1) allowed',[f])).rows[0].allowed,false);await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated;savepoint rejection`);await assert.rejects(db.query('select save_contribution($1)',[{feature_id:f,type:'Tip',title:'New contribution',body:'A substantive proposed new addition to the old edition.',target_section:'Contribution',public_credit:'Anonymous Panelist',publication_consent:true}]),/Workshop is closed/);await db.exec('rollback to savepoint rejection;reset role');});
 }finally{await db.close();}
});
