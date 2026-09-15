import { draftDocument, serializeComposerSections, type ComposerSection } from "../../router-app/lib/editorial-alpha";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  actionFailure,
  pausedMessage,
  staleMessage,
} from "../../router-app/lib/action-feedback";

test("safe feedback never exposes provider responses", () => {
  assert.equal(
    actionFailure(
      { code: "P4290", message: "internal threshold" },
      "Try again",
    ),
    pausedMessage,
  );
  assert.equal(actionFailure({ code: "P4090" }, "Try again"), staleMessage);
  assert.equal(
    actionFailure({ message: "database credentials" }, "Try again"),
    "Try again",
  );
});

test("complete migrations enforce direct-request quotas, active accounts, private drafts and lifecycle guards", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000099",
    owner = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security; grant select,insert on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (file === "202609110009_koma_handbook_panel_repair.sql")
        await db.exec(
          `insert into auth.users(id) values('${admin}'); update profiles set role='admin' where id='${admin}'`,
        );
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [owner, JSON.stringify({ full_name: "Google Member" })],
    );
    assert.equal(
      (await db.query("select display_name from profiles where id=$1", [owner]))
        .rows[0].display_name,
      "Google Member",
    );
    await db.exec(
      `insert into editorial_access_grants(user_id,access_level,granted_by) values('${owner}','editor','${admin}');`,
    );
    const as = async (id: string) => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    };
    const delayed='00000000-0000-4000-8000-000000000008';
    await db.exec('alter table auth.users disable trigger open_panel_profile');
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[delayed,JSON.stringify({full_name:'Delayed Google member'})]);
    await db.exec('alter table auth.users enable trigger open_panel_profile');
    await as(delayed);
    await db.query('select bootstrap_member_profile()');
    await db.query("update profiles set display_name='Chosen identity' where id=$1",[delayed]);
    await db.query('select bootstrap_member_profile()');
    assert.deepEqual((await db.query('select display_name,role,account_status from profiles where id=$1',[delayed])).rows[0],{display_name:'Chosen identity',role:'member',account_status:'active'});
    await db.exec('reset role');await db.exec('set role anon');
    await assert.rejects(db.query('select bootstrap_member_profile()'),/permission denied/);
    await as(owner);
    const version = (
      await db.query<any>("select * from handbook_versions where active")
    ).rows[0];
    await db.query("select accept_handbook($1,$2,$3,true)", [
      version.id,
      version.content_hash,
      version.statement_version,
    ]);
    const payload = {
      title: "Untitled draft",
      slug: "incomplete-alpha",
      summary: "",
      document: { schemaVersion: 1, modules: [] },
      status: "draft",
    };
    const save = async (p: object) =>
      (
        await db.query<{ id: string }>("select save_editorial_draft($1) id", [
          JSON.stringify(p),
        ])
      ).rows[0].id;
    const requestKey="11111111-1111-4111-8111-111111111111";
    const id = await save({...payload,request_key:requestKey});
    assert.equal(await save({...payload,request_key:requestKey}),id);
    const row = (
      await db.query<any>(
        "select * from editorial_documents where feature_id=$1",
        [id],
      )
    ).rows[0];
    assert.equal(row.submitted_at, null);
    await assert.rejects(db.query("select submit_editorial_draft($1)",[id]),/information incomplete|sections/);
    await assert.rejects(
      save({ ...payload, feature_id: id, status: "published" }),
      /authorised lifecycle/,
    );
    await assert.rejects(
      save({ ...payload, feature_id: id, expected_updated_at: "2000-01-01" }),
      /Newer version/,
    );
    assert.equal(
      (
        await db.query<any>(
          "select * from editorial_documents where feature_id=$1",
          [id],
        )
      ).rows[0].working_document.modules.length,
      0,
    );
    const sections:ComposerSection[]=[{id:'h',type:'heading',text:'Opening'},{id:'p',type:'paragraph',text:'Body text'},{id:'i',type:'image',url:'/image.png',alt:'Artwork'},{id:'q',type:'quote',text:'Quote',attribution:'Author'},{id:'b',type:'bullet-list',text:'One\nTwo'},{id:'n',type:'numbered-list',text:'First\nSecond'},{id:'v',type:'video',url:'https://youtu.be/dQw4w9WgXcQ'},{id:'d',type:'divider'}];
    const asset=`editorial/${owner}/lifecycle-fixture/11111111-1111-4111-8111-111111111111.png`;
    await db.query("insert into storage.objects(bucket_id,name) values('editorial-feature-images',$1)",[asset]);
    sections[2].url='/api/editorial/image?path='+asset;
    const document=draftDocument({title:'Lifecycle fixture',slug:'lifecycle-fixture',summary:'All eight sections persist.',sectionsJson:serializeComposerSections(sections)});
    const feature=await save({...payload,slug:'lifecycle-fixture',title:'Lifecycle fixture',summary:'All eight sections persist.',document});
    await db.exec('reset role');await db.exec('set role anon');
    assert.equal((await db.query('select * from storage.objects where name=$1',[asset])).rows.length,0);
    await as(owner);
    await db.query('select submit_editorial_draft($1)',[feature]);
    const first=(await db.query<any>('select submitted_at from editorial_documents where feature_id=$1',[feature])).rows[0].submitted_at;
    await db.query('select submit_editorial_draft($1)',[feature]);
    assert.ok(first);
    await assert.rejects(save({...payload,feature_id:feature}),/panel has moved on/);
    await assert.rejects(db.query('select publish_editorial_panel($1)',[feature]),/access required/i);
    await as(admin);
    await db.query('select accept_handbook($1,$2,$3,true)',[version.id,version.content_hash,version.statement_version]);
    const inbox=(await db.query<any>('select * from editorial_review_inbox()')).rows;
    assert.ok(inbox.some(r=>r.feature_id===feature));
    await db.query("select editorial_review_draft($1,'changes','Clarify opening')",[feature]);
    await as(owner);
    await save({...payload,feature_id:feature,slug:'lifecycle-fixture',title:'Lifecycle fixture',summary:'All eight sections persist.',document,status:'changes_requested'});
    await db.query('select submit_editorial_draft($1)',[feature]);
    assert.deepEqual((await db.query<any>('select submitted_at from editorial_documents where feature_id=$1',[feature])).rows[0].submitted_at,first);
    await as(admin);
    await db.query("select editorial_review_draft($1,'approve','')",[feature]);
    await db.query('select publish_editorial_panel($1)',[feature]);
    await db.exec('reset role'); await db.exec('set role anon');
    const published=(await db.query<any>("select public_editorial_document('lifecycle-fixture') doc")).rows[0].doc;
    assert.deepEqual(published.modules.map((m:any)=>m.id),sections.map(m=>m.id));
    assert.equal((await db.query("select * from storage.objects where name=$1",[asset])).rows.length,1);
    await db.exec('reset role');await as(admin);
    await db.query('select take_down_editorial_panel($1)',[feature]);
    await db.exec('reset role'); await db.exec('set role anon');
    assert.equal((await db.query<any>("select public_editorial_document('lifecycle-fixture') doc")).rows[0].doc,null);
    await db.exec('reset role');await as(owner);
    await db.exec("reset role");
    await db.exec(
      "update abuse_action_limits set hourly_limit=1 where action='profile'",
    );
    await as(owner);
    await db.query("update profiles set display_name=$1 where id=$2", [
      "Chosen name",
      owner,
    ]);
    await assert.rejects(
      db.query("update profiles set display_name=$1 where id=$2", [
        "Too soon",
        owner,
      ]),
      /temporarily paused/,
    );
    assert.equal(
      (
        await db.query<any>("select display_name from profiles where id=$1", [
          owner,
        ])
      ).rows[0].display_name,
      "Chosen name",
    );
    await db.exec("reset role");
    await db.exec(
      "update abuse_action_counts set hour_started=now()-interval '2 hours'",
    );
    await as(owner);
    await db.query("update profiles set display_name=$1 where id=$2", [
      "Safe retry",
      owner,
    ]);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query(
      "update profiles set account_status='suspended' where id=$1",
      [owner],
    );
    await as(owner);
    await assert.rejects(
      save({ ...payload, feature_id: id }),
      /active membership/i,
    );
    await db.exec("reset role");
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from editorial_documents"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
