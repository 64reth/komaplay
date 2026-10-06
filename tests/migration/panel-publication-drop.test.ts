import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor='00000000-0000-4000-8000-000000000099';
test('Panel publication resolves its weekly container',async(t)=>{
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
  const reviewer='00000000-0000-4000-8000-000000000098';
  await db.exec(`insert into auth.users(id) values('${reviewer}');update profiles set role='moderator' where id='${reviewer}'`);
  const fixture=async(drop=true)=>{
   await db.exec("update issues set status='finalising' where status='current'");
   const i=crypto.randomUUID(),d=crypto.randomUUID();
   await db.query("insert into issues(id,issue_number,slug,title,year,month,status,opens_at,closes_at) values($1,9999,$2,'New Issue',2100,1,'current',now()-interval '1 day',now()+interval '1 month')",[i,'new-'+i]);
   if(drop)await db.query("insert into weekly_drops(id,issue_id,week_number,label,status,display_order) values($1,$2,1,'Week 1','draft',1)",[d,i]);
   return {i,d:drop?d:null};
  };
  const panel=async(i:string|null,d:string|null)=>{const id=crypto.randomUUID();await db.query("insert into features(id,slug,title,summary,status,lifecycle_status,issue_id,weekly_drop_id) values($1,$2,'Real title','A capped publication summary','draft','draft',$3,$4)",[id,'panel-'+id,i,d]);await db.query("insert into editorial_documents(feature_id,author_id,submitted_by,reviewed_by,reviewed_at,lifecycle_status,working_document) values($1,$2,$2,$3,now(),'approved','{}')",[id,actor,reviewer]);return id;};
  const publish=async(id:string)=>{await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);set role authenticated`);await db.query('select publish_editorial_panel($1)',[id]);await db.exec('reset role');};
  const visible=async(id:string)=>(await db.query('select id from public_features where id=$1',[id])).rows.length;
  const check=async(name:string,fn:()=>Promise<void>)=>t.test(name,async()=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback;reset role');}});
  await check('first publication activates the empty draft drop; subsequent publication reuses it',async()=>{const {i,d}=await fixture();const first=await panel(i,d),second=await panel(i,d);assert.equal(await visible(first),0);await publish(first);assert.equal(await visible(first),1);assert.equal(await visible(second),0);await publish(second);assert.equal(await visible(second),1);assert.equal((await db.query('select id from weekly_drops where issue_id=$1',[i])).rows.length,1);});
  await check('missing Issue/drop assignment resolves current Issue and creates infrastructure',async()=>{const {i}=await fixture(false);const id=await panel(null,null);await publish(id);assert.equal(await visible(id),1);assert.equal((await db.query<{issue_id:string}>('select issue_id from features where id=$1',[id])).rows[0].issue_id,i);});
  await check('approved but unpublished Panel stays private even in a published drop',async()=>{const {i,d}=await fixture();await publish(await panel(i,d));const approved=await panel(i,d);assert.equal(await visible(approved),0);});
  await check('retry repairs an already-published Panel with a draft drop without duplicate history',async()=>{const {i,d}=await fixture();const id=await panel(i,d);await publish(id);const before=(await db.query('select * from editorial_document_snapshots where feature_id=$1',[id])).rows;await db.query("update weekly_drops set status='draft',published_at=null where id=$1",[d]);assert.equal(await visible(id),0);await publish(id);await publish(id);assert.equal(await visible(id),1);assert.deepEqual((await db.query('select * from editorial_document_snapshots where feature_id=$1',[id])).rows,before);});
  await check('stale publish after review changes is rejected without activating its drop',async()=>{const {i,d}=await fixture();const id=await panel(i,d);await db.exec(`select set_config('request.jwt.claim.sub','${reviewer}',false);select accept_handbook(id,content_hash,statement_version,true) from handbook_versions where active;set role authenticated`);await db.query("select editorial_review_draft($1,'changes','Please revise the evidence')",[id]);await db.exec('reset role;savepoint stale');await assert.rejects(publish(id),/Only publish-ready/);await db.exec('rollback to savepoint stale;reset role');assert.equal(await visible(id),0);assert.equal((await db.query<{status:string}>('select status from weekly_drops where id=$1',[d])).rows[0].status,'draft');});
  await check('failure during publication rolls back drop activation and association',async()=>{const {i,d}=await fixture();const id=await panel(i,d);await db.exec("alter table features add constraint simulate_publish_failure check(status<>'published') not valid;savepoint failed");await assert.rejects(publish(id),/simulate_publish_failure/);await db.exec('rollback to savepoint failed;reset role');assert.equal((await db.query<{status:string}>('select status from weekly_drops where id=$1',[d])).rows[0].status,'draft');assert.equal(await visible(id),0);});
  await check('a future publication timestamp cannot report successful immediate publication',async()=>{const {i,d}=await fixture();const id=await panel(i,d);await db.query("update features set published_at=now()+interval '1 day' where id=$1",[id]);await db.exec('savepoint future');await assert.rejects(publish(id),/public catalogue visibility/);await db.exec('rollback to savepoint future;reset role');assert.equal((await db.query<{status:string}>('select status from weekly_drops where id=$1',[d])).rows[0].status,'draft');assert.equal(await visible(id),0);});
  await check('archived Issue cannot be reopened by publishing or a publication retry',async()=>{const {i,d}=await fixture();const id=await panel(i,d);await publish(id);await db.exec("alter table issues disable trigger user");await db.query("update issues set status='archived' where id=$1",[i]);await db.exec("alter table issues enable trigger user");await db.exec('savepoint rejection');await assert.rejects(publish(id),/Choose an open Issue/);await db.exec('rollback to savepoint rejection;reset role');assert.equal((await db.query("select f.id from public_features f join issues i on i.id=f.issue_id where f.id=$1 and i.status='current'",[id])).rows.length,0);});
 }finally{await db.close();}
});
