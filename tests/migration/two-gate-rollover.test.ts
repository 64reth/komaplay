import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor='00000000-0000-4000-8000-000000000099';
test('monthly rollover has exactly calendar and submitted-cover gates',async(t)=>{
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
  const check=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback;reset role');}});
  await check('month not ended remains open even with a submitted cover',async()=>{const i=await issue(2199);await candidate(i);await run();assert.equal(await status(i),'finalising');});
  await check('saved artwork and private drafts are not submissions; visibly AWAITING COVER',async()=>{const i=await issue();await candidate(i,'draft');await run();assert.equal(await status(i),'finalising');assert.match((await db.query<{message:string}>('select message from issue_rollover where issue_id=$1',[i])).rows[0].message,/^AWAITING COVER:/);});
  await check('one cover archives without a lead, published Panel, deadline or extra confirmation; retries do not duplicate',async()=>{
   const i=await issue(),c=await candidate(i);await db.query(`insert into issue_rollover(issue_id,phase) values($1,'paused')`,[i]);
   const count=(await db.query('select count(*) from issues')).rows;
   await run();assert.equal(await status(i),'archived');assert.deepEqual((await db.query('select cover_art,lead_feature_id from issues where id=$1',[i])).rows,[{cover_art:c.art,lead_feature_id:null}]);
   await run();assert.equal((await db.query('select * from issue_cover_audit where issue_id=$1',[i])).rows.length,2);assert.deepEqual((await db.query('select count(*) from issues')).rows,count);
  });
  await check('multiple tied submissions wait; a unique vote leader resolves using existing votes',async()=>{
   const i=await issue();await candidate(i);const b=await candidate(i);await run();assert.equal(await status(i),'finalising');assert.match((await db.query<{message:string}>('select message from issue_rollover where issue_id=$1',[i])).rows[0].message,/^AWAITING COVER SELECTION:/);
   await db.query('insert into issue_cover_votes(issue_id,voter_id,candidate_id) values($1,$2,$3)',[i,actor,b.id]);await run();assert.equal(await status(i),'archived');assert.equal((await db.query<{cover_art:string}>('select cover_art from issues where id=$1',[i])).rows[0].cover_art,b.art);
  });
  await check('valid confirmed selection is preserved',async()=>{const i=await issue(),a=await candidate(i,'selected');await candidate(i);await run();assert.equal(await status(i),'archived');assert.equal((await db.query<{cover_art:string}>('select cover_art from issues where id=$1',[i])).rows[0].cover_art,a.art);assert.equal((await db.query("select * from issue_cover_audit where issue_id=$1 and details ? 'selection'",[i])).rows.length,0);});
  await check('unavailable cover remains open',async()=>{const i=await issue(),a=await candidate(i);await db.query('delete from storage.objects where name=$1',[a.art]);await run();assert.equal(await status(i),'finalising');});
  await check('submission and explicit selection accept no lead Panel',async()=>{const i=await issue(),a=await candidate(i,'draft');await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated`);await db.query("select cover_pool_action('submit',$1,$2)",[i,a.id]);await db.query("select cover_pool_action('select',$1,$2,'{}',true)",[i,a.id]);await db.exec('reset role');await run();assert.equal(await status(i),'archived');});
  await check('archive failure rolls back selection and exact membership; retry succeeds and published Panels stay public',async()=>{
   const i=await issue(),c=await candidate(i),f=crypto.randomUUID(),hidden=crypto.randomUUID(),drop=crypto.randomUUID();
   await db.query(`insert into weekly_drops(id,issue_id,week_number,label,status,published_at) values($1,$2,1,'Published drop','published',now())`,[drop,i]);
   await db.query(`insert into features(id,issue_id,slug,title,status,lifecycle_status,deadline_override,weekly_drop_id) values($1,$2,$3,'Published','published','open_panel',now()+interval '1 year',$6),($4,$2,$5,'Hidden','published','taken_down',null,$6)`,[f,i,'rollover-'+f,hidden,'rollover-'+hidden,drop]);
   await db.query(`insert into editorial_documents(feature_id,author_id,schema_version,working_document,lifecycle_status) values($1,$2,1,'{"schemaVersion":1,"modules":[]}','published')`,[f,actor]);
   await db.exec("alter table issue_cover_audit add constraint forced_failure check(action<>'archive-validated') not valid");await run();assert.equal(await status(i),'finalising');assert.equal((await db.query<{status:string}>('select status from issue_cover_candidates where id=$1',[c.id])).rows[0].status,'submitted');assert.equal((await db.query<{phase:string}>('select phase from issue_rollover where issue_id=$1',[i])).rows[0].phase,'error');
   await db.exec("alter table issue_cover_audit drop constraint forced_failure;set timezone='Pacific/Honolulu'");await run();assert.equal(await status(i),'archived');assert.deepEqual((await db.query('select id from public_features where issue_id=$1',[i])).rows,[{id:f}]);assert.equal((await db.query('select * from editorial_document_snapshots where feature_id=$1',[f])).rows.length,1);
  });
 }finally{await db.close();}
});
