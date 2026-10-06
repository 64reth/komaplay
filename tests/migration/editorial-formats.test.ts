import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { composerDraftSchema, draftDocument, composerFromWorkItem } from '../../router-app/lib/editorial-alpha';
import { editorialFormatSlugs } from '../../router-app/lib/editorial-formats';
import { PGlite } from '@electric-sql/pglite';

const actor='00000000-0000-4000-8000-000000000099';
test('editorial formats remain metadata through the canonical lifecycle',async(t)=>{
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
  await db.exec(`select set_config('request.jwt.claim.sub','${reviewer}',false);select accept_handbook(id,content_hash,statement_version,true) from handbook_versions where active`);
  const as=async(id:string)=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`);
  for(const format of ['essay','review','feature','editorial','news','interview']) await t.test(format,async()=>{
   await db.exec('begin');try{
    await as(actor);
    const payload={title:'Format lifecycle check',slug:'format-'+format,summary:'An editor-authored summary.',format,status:'draft',document:{schemaVersion:1,modules:[] as object[],composer:{format}}};
    const saved=(await db.query<{id:string}>('select save_editorial_draft($1) id',[payload])).rows[0].id;
    const check=async()=>{await db.exec('reset role');assert.equal((await db.query<{slug:string}>('select cf.slug from features f join content_formats cf on cf.id=f.format_id where f.id=$1',[saved])).rows[0].slug,format);};
    await check();await as(actor);
    const reopened=(await db.query<{working_document:{modules:unknown[];composer:{format:string}}}>('select * from editorial_my_work() where feature_id=$1',[saved])).rows[0];assert.deepEqual(reopened.working_document.modules,[]);assert.equal(reopened.working_document.composer.format,format);
    payload.document.modules=[{id:'author-paragraph',type:'paragraph',version:1,content:{text:'Text entered by the test author.'}}];
    await db.query('select save_editorial_draft($1)',[{...payload,feature_id:saved}]);await check();await as(actor);await db.query('select submit_editorial_draft($1)',[saved]);await check();await as(reviewer);await db.query("select editorial_review_draft($1,'changes','Please expand the context')",[saved]);await check();await as(actor);await db.query('select save_editorial_draft($1)',[{...payload,feature_id:saved,status:'changes_requested'}]);await db.query('select submit_editorial_draft($1)',[saved]);await as(reviewer);await db.query("select editorial_review_draft($1,'approve','')",[saved]);await check();await as(reviewer);await db.query('select publish_editorial_panel($1)',[saved]);await check();await as(reviewer);await db.exec('reset role');const issue=(await db.query<{issue_id:string}>('select issue_id from features where id=$1',[saved])).rows[0].issue_id;const cover=crypto.randomUUID(),art=`cover-pool/${reviewer}/${cover}.png`;await db.query("insert into storage.objects(bucket_id,name,owner_id) values('issue-cover-pool',$1,$2)",[art,reviewer]);await db.query("insert into issue_cover_candidates(id,issue_id,created_by,status,submitted_at,payload) values($1,$2,$3,'submitted',now(),$4)",[cover,issue,reviewer,{cover_art:art,cover_art_alt:'Test cover',lead_headline:'Test issue',secondary_cover_lines:[],cover_preset:'minimal'}]);await as(reviewer);await db.query('select close_issue($1)',[issue]);await check();assert.equal((await db.query<{lifecycle_status:string}>('select lifecycle_status from editorial_documents where feature_id=$1',[saved])).rows[0].lifecycle_status,'archived');
   }finally{await db.exec('rollback;reset role');}
  });
 }finally{await db.close();}
});

test('all formats use the identical empty document and Essay remains the legacy default',()=>{
 const documents=editorialFormatSlugs.map(format=>draftDocument(composerDraftSchema.parse({format,sectionsJson:'[]'})));
 documents.forEach(doc=>{assert.deepEqual(doc,documents[0]);assert.deepEqual(doc.modules,[]);assert.equal(doc.header.title,'');});
 assert.equal(composerDraftSchema.parse({}).format,'essay');
 assert.equal(composerFromWorkItem({feature_id:'legacy',title:'Older Essay',slug:'older-essay',summary:'Existing summary',lifecycle_status:'draft',updated_at:'2026-10-01',working_document:documents[0]}).format,'essay');
 assert.equal(composerDraftSchema.safeParse({format:'template'}).success,false);
});
