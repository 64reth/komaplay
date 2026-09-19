import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { submissionCopy } from '../../router-app/lib/editorial-validation';
import { action } from '../../router-app/routes/editorial';
import { composerFromWorkItem, parseComposerSections, serializeComposerSections, type ComposerSection, type EditorialWorkItem } from '../../router-app/lib/editorial-alpha';

// Exercise the real route action and SQL RPCs. Only Auth/PostgREST HTTP transport is simulated.
// Explicitly exclude pending Phase 5 hardening: this repair must work without it.
test('production missing-column error is reproduced, then narrow migration repairs modular save and both submit paths', async () => {
  const db = new PGlite();
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_ANON_KEY;
  const owner = '00000000-0000-4000-8000-000000000001';
  const editor = '00000000-0000-4000-8000-000000000002';
  const member = '00000000-0000-4000-8000-000000000003';
  const admin = '00000000-0000-4000-8000-000000000099';
  let actor = owner;
  const rpcCalls: string[] = [];
  const rpcErrors: string[] = [];
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security; grant select,insert on storage.objects to anon,authenticated;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql') && f <= '202609140001_editorial_feature_image_upload.sql').sort()) {
      if (file === '202609110009_koma_handbook_panel_repair.sql') await db.exec(`insert into auth.users(id) values('${admin}'); update profiles set role='admin' where id='${admin}'`);
      await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    }
    for (const id of [owner, editor, member]) await db.query('insert into auth.users(id) values($1)', [id]);
    for (const id of [owner, editor]) await db.query("insert into editorial_access_grants(user_id,access_level,granted_by) values($1,'editor',$2)", [id, admin]);
    await db.exec("update issues set opens_at=now()-interval '1 day',closes_at=now()+interval '20 days' where status='current'; update weekly_drops set status='published',published_at=now()-interval '1 day'");
    const as = async (id: string) => {
      actor = id;
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    const version = (await db.query<{id:string;content_hash:string;statement_version:string}>('select * from handbook_versions where active')).rows[0];
    await db.exec(await readFile('supabase/migrations/202609190001_editorial_save_version.sql','utf8'));
    for (const id of [owner, editor, member, admin]) {
      await as(id);
      await db.query('select accept_handbook($1,$2,$3,true)', [version.id, version.content_hash, version.statement_version]);
    }
    process.env.SUPABASE_URL = 'https://diagnostic.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'fixture-public-key';
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      let result: unknown;
      try {
        if (url.pathname === '/auth/v1/user') result = {id: actor, aud:'authenticated', role:'authenticated'};
        else if (url.pathname === '/rest/v1/categories') result = (await db.query('select id from categories')).rows;
        else if (url.pathname === '/rest/v1/profiles') result = (await db.query('select id,display_name,role,account_status from profiles where id=$1', [actor])).rows[0];
        else if (url.pathname === '/rest/v1/handbook_versions') result = (await db.query('select * from handbook_versions where active')).rows[0];
        else if (url.pathname === '/rest/v1/handbook_acceptances') result = (await db.query('select * from handbook_acceptances where user_id=$1 and handbook_version_id=$2', [actor, version.id])).rows[0];
        else if (url.pathname === '/rest/v1/editorial_access_grants') result = (await db.query('select id,access_level,revoked_at from editorial_access_grants where user_id=$1 and revoked_at is null', [actor])).rows;
        else {
          const body = JSON.parse(String(init?.body ?? '{}'));
          const name = url.pathname.split('/').at(-1)!;
          rpcCalls.push(name);
          if (name === 'editorial_has_access') result = (await db.query('select editorial_has_access($1,$2) value', [actor, body.review])).rows[0].value;
          else if (name === 'save_editorial_draft_versioned') result = (await db.query('select save_editorial_draft_versioned($1::jsonb) value', [JSON.stringify(body.payload)])).rows[0].value;
          else if (name === 'submit_editorial_draft') result = (await db.query('select submit_editorial_draft($1) value', [body.target])).rows[0].value;
          else if (name === 'editorial_my_work') result = (await db.query('select * from editorial_my_work()')).rows;
          else throw new Error('Unexpected fixture request: ' + url.pathname);
        }
        return new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json'}});
      } catch (error) {
        const failure = error as {code?:string;message:string};
        rpcErrors.push(failure.message);
        return new Response(JSON.stringify({code: failure.code, message: failure.message}), {status:400,headers:{'Content-Type':'application/json'}});
      }
    };
    const sections: ComposerSection[] = [
      {id:'heading-1',type:'heading',text:'Opening'},
      {id:'paragraph-1',type:'paragraph',text:'Paragraph content.'},
      {id:'image-1',type:'image',url:'/fixture.png',alt:'Fixture artwork'},
      {id:'quote-1',type:'quote',text:'Quoted text',attribution:'Fixture author'},
      {id:'bullet-1',type:'bullet-list',text:'One\nTwo'},
      {id:'numbered-1',type:'numbered-list',text:'First\nSecond'},
      {id:'video-1',type:'video',url:'https://youtu.be/dQw4w9WgXcQ'},
      {id:'divider-1',type:'divider'},
    ];
    const run = async (intent: string, featureId = '', slug = 'timestamp-fixture', content = sections, overrides: Record<string,string> = {}) => {
      const form = new FormData();
      Object.entries({intent,featureId,title:'Timestamp fixture',slug,summary:'An eight-section local fixture.',sectionsJson:serializeComposerSections(content)}).forEach(([key,value])=>form.set(key,value));
      for(const [key,value] of Object.entries(overrides))form.set(key,value);
      if (intent === 'submit-existing') form.delete('title');
      const jwt = ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:actor,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
      const cookie = 'sb-diagnostic-auth-token=base64-' + Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:actor}})).toString('base64url');
      return await action({request:new Request('https://komaplay.com/editorial',{method:'POST',headers:{cookie,origin:'https://komaplay.com'},body:form})} as Parameters<typeof action>[0]);
    };
    const row = async (id:string) => (await db.query<{submitted_at:Date|null;lifecycle_status:string;working_document:unknown}>('select submitted_at,lifecycle_status,working_document from editorial_documents where feature_id=$1',[id])).rows[0];
    await as(owner);
    const broken = await run('save');
    assert.equal(broken.init?.status,400);
    assert.ok('error' in broken.data);
    assert.ok(rpcErrors.some(error=>/column "submitted_at" of relation "editorial_documents" does not exist/.test(error)));
    assert.equal(broken.data.error,submissionCopy.saveFailure);
    assert.equal((await db.query('select * from editorial_my_work()')).rows.length,0);
    await db.exec('reset role');
    await db.exec(await readFile('supabase/migrations/202609150001_editorial_submission_timestamp.sql','utf8'));
    const column=(await db.query("select data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='editorial_documents' and column_name='submitted_at'")).rows[0];
    assert.deepEqual(column,{data_type:'timestamp with time zone',is_nullable:'YES',column_default:null});
    await as(owner);
    const saved=await run('save');
    assert.ok('featureId' in saved.data);
    const id=String(saved.data.featureId);
    assert.equal(saved.data.status,'draft');assert.match(saved.data.success,/Draft saved/);
    assert.equal((await row(id)).submitted_at,null);
    const work=(await db.query<EditorialWorkItem>('select * from editorial_my_work()')).rows;
    assert.equal(work.length,1);assert.equal(work[0].feature_id,id);
    const reopened=parseComposerSections(composerFromWorkItem(work[0]).sectionsJson);
    assert.deepEqual(reopened.map(s=>s.id),sections.map(s=>s.id));
    assert.equal(reopened[3].attribution,'Fixture author');
    const reordered=[...sections].reverse();
    for(let i=0;i<2;i++) {const updated=await run('save',id,'timestamp-fixture',reordered);assert.ok('featureId' in updated.data);assert.equal(updated.data.featureId,id);}
    assert.equal((await row(id)).submitted_at,null);
    assert.equal((await db.query('select * from editorial_my_work()')).rows.length,1);
    const invalid=await run('submit',id,'timestamp-fixture',sections.map(s=>s.type==='image'?{...s,alt:''}:s));
    assert.ok('error' in invalid.data);assert.equal(invalid.data.error,submissionCopy.blocked);assert.ok("issues" in invalid.data);assert.ok(invalid.data.issues.some(issue=>issue.sectionId==="image-1"&&issue.field==="alt"));assert.equal((await row(id)).submitted_at,null);
    assert.ok("featureId" in invalid.data);assert.equal(invalid.data.featureId,id);
    assert.ok('savedVersion' in invalid.data);
    const exactSavedVersion=(await db.query<any>("select to_jsonb(updated_at) version from editorial_documents where feature_id=$1",[id])).rows[0].version;
    assert.equal(invalid.data.savedVersion,exactSavedVersion);
    assert.equal(invalid.data.error,submissionCopy.blocked);
    assert.equal((await row(id)).lifecycle_status,"draft");
    const invalidWork=(await db.query<EditorialWorkItem>("select * from editorial_my_work()")).rows.find(item=>item.feature_id===id)!;
    assert.equal(parseComposerSections(composerFromWorkItem(invalidWork).sectionsJson).find(section=>section.type==="image")!.alt,"");
    const submitted=await run('submit',id,'timestamp-fixture',reordered);
    assert.ok('featureId' in submitted.data);assert.equal(submitted.data.featureId,id);assert.equal(submitted.data.status,'submitted');
    const submittedWork=(await db.query<EditorialWorkItem>('select * from editorial_my_work()')).rows.find(item=>item.feature_id===id)!;
    assert.deepEqual(parseComposerSections(composerFromWorkItem(submittedWork).sectionsJson).map(section=>section.id),reordered.map(section=>section.id));
    const timestamp=(await row(id)).submitted_at;assert.ok(timestamp);
    await run('submit',id,'timestamp-fixture',reordered);assert.deepEqual((await row(id)).submitted_at,timestamp);
    await as(editor);assert.equal((await db.query('select * from editorial_my_work()')).rows.length,0);
    assert.equal((await db.query('select * from editorial_review_inbox()')).rows[0].feature_id,id);
    await as(member);assert.equal((await db.query('select * from editorial_review_inbox()')).rows.length,0);
    await as(owner);
    const second=await run('save','','existing-submit-fixture');assert.ok('featureId' in second.data);const secondId=String(second.data.featureId);
    assert.equal((await row(secondId)).submitted_at,null);
    // Production reproduction: a saved body image with no alt stays a draft;
    // submitting from MY PANELS must report the validation failure, not enter review.
    const incomplete = sections.map(section=>section.type==='image'?{...section,alt:''}:section);
    const failedSave = await run('submit','','timestamp-fixture',incomplete);
    assert.ok('error' in failedSave.data);
    assert.equal(failedSave.data.error,submissionCopy.blocked);assert.ok('issues' in failedSave.data);assert.ok(failedSave.data.issues.some(issue=>issue.field==='slug'));
    assert.ok('featureId' in failedSave.data);
    const duplicateRowSubmit = await run('submit-existing',String(failedSave.data.featureId));
    assert.ok('issues' in duplicateRowSubmit.data);
    assert.ok(duplicateRowSubmit.data.issues.some(issue=>issue.field==='slug'));
    await run('save',secondId,'existing-submit-fixture',incomplete);
    const invalidSaved = await run('submit-existing',secondId);
    assert.equal(invalidSaved.init?.status,400);
    assert.ok('error' in invalidSaved.data);
    assert.equal(invalidSaved.data.error,submissionCopy.blocked);
    assert.equal((await row(secondId)).lifecycle_status,'draft');
    assert.equal((await row(secondId)).submitted_at,null);
    await as(editor);
    assert.ok(!(await db.query<EditorialWorkItem>('select * from editorial_review_inbox()')).rows.some(item=>item.feature_id===secondId));
    await as(owner);
    const corrected = await run('save',secondId,'existing-submit-fixture');
    assert.ok('featureId' in corrected.data);assert.equal(corrected.data.featureId,secondId);
    const existing=await run('submit-existing',secondId);assert.ok('featureId' in existing.data);assert.equal(existing.data.featureId,secondId);
    const existingTimestamp=(await row(secondId)).submitted_at;assert.ok(existingTimestamp);
    await db.exec('reset role');
    // Fixture-only legacy profile: current schema rejects empty display names.
    await db.exec('alter table profiles drop constraint profiles_display_name_check');
    await db.query("update profiles set display_name='' where id=$1",[owner]);
    await as(editor);
    const universal=(await db.query<EditorialWorkItem & {author_display_name:string}>('select * from editorial_review_inbox()')).rows.find(item=>item.feature_id===secondId)!;
    assert.ok(universal);assert.equal(universal.author_display_name,'Panelist');
    assert.deepEqual(parseComposerSections(composerFromWorkItem(universal).sectionsJson).map(section=>section.id),sections.map(section=>section.id));
    await as(owner);
    await run('submit-existing',secondId);assert.deepEqual((await row(secondId)).submitted_at,existingTimestamp);
    await as(admin);await db.query("select editorial_review_draft($1,'changes','Please revise the opening')",[secondId]);
    await as(owner);await run('save',secondId,'existing-submit-fixture');assert.deepEqual((await row(secondId)).submitted_at,existingTimestamp);
    await run('submit-existing',secondId);assert.deepEqual((await row(secondId)).submitted_at,existingTimestamp);
    // A late database failure rolls back both the lifecycle change and timestamp.
    const failing=await run('save','','rollback-fixture');assert.ok('featureId' in failing.data);const failingId=String(failing.data.featureId);
    await db.exec('reset role');
    await db.exec(`create function public.fail_submission_snapshot_fixture() returns trigger language plpgsql as $$begin if new.reason='Submitted for review' then raise exception 'Fixture snapshot failure'; end if; return new; end $$;
      create trigger fail_submission_snapshot_fixture before insert on editorial_document_snapshots for each row execute function public.fail_submission_snapshot_fixture()`);
    await as(owner);
    const rejected=await run('submit',failingId,'rollback-fixture');assert.ok('error' in rejected.data);assert.equal(rejected.data.error,submissionCopy.submitFailure);assert.ok("featureId" in rejected.data);assert.equal(rejected.data.featureId,failingId);assert.doesNotMatch(rejected.data.error,/Fixture snapshot failure/);
    assert.equal((await row(failingId)).submitted_at,null);assert.equal((await row(failingId)).lifecycle_status,'draft');
    await db.exec('reset role');await db.exec('drop trigger fail_submission_snapshot_fixture on editorial_document_snapshots; drop function fail_submission_snapshot_fixture()');
    await as(owner);
    const direct=await run('submit','','direct-submit-fixture');assert.ok('featureId' in direct.data);assert.ok((await row(String(direct.data.featureId))).submitted_at);
    const duplicate=await run('save','','direct-submit-fixture');assert.ok('featureId' in duplicate.data);assert.equal(duplicate.data.success,submissionCopy.saved);
    assert.equal((await db.query("select * from editorial_my_work() where slug='direct-submit-fixture'")).rows.length,1);
    const empty = await run('save','','',incomplete,{title:'',summary:'',image:'/hero.png',imageAlt:''});
    assert.ok('featureId' in empty.data);assert.equal(empty.data.success,submissionCopy.saved);
    const emptyId=String(empty.data.featureId);
    const emptyWork=(await db.query<EditorialWorkItem>('select * from editorial_my_work()')).rows.find(item=>item.feature_id===emptyId)!;
    const reopenedEmpty=composerFromWorkItem(emptyWork);
    assert.equal(reopenedEmpty.title,'');assert.equal(reopenedEmpty.slug,'');assert.equal(reopenedEmpty.summary,'');assert.equal(reopenedEmpty.imageAlt,'');
    assert.deepEqual(parseComposerSections(reopenedEmpty.sectionsJson).map(section=>section.id),sections.map(section=>section.id));
    const blockedEmpty=await run('submit-existing',emptyId);
    assert.ok('issues' in blockedEmpty.data);assert.ok(blockedEmpty.data.issues.length>=5);
    assert.equal((await row(emptyId)).submitted_at,null);
    const repairedEmpty=await run('submit',emptyId,'completed-empty-draft',sections);
    assert.ok('featureId' in repairedEmpty.data);assert.equal(repairedEmpty.data.featureId,emptyId);assert.equal(repairedEmpty.data.success,submissionCopy.submitted);
    assert.ok(rpcCalls.includes('save_editorial_draft_versioned'));assert.ok(rpcCalls.includes('submit_editorial_draft'));
  } finally {
    globalThis.fetch=previousFetch;
    if(previousUrl===undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL=previousUrl;
    if(previousKey===undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY=previousKey;
    await db.close();
  }
});
