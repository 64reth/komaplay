import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Postgres migration: RLS, moderation atomicity, roles, withdrawal and seed", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  await db.exec(
    await readFile("supabase/migrations/202609100001_open_panel.sql", "utf8"),
  );
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
  for (const id of ids)
    await db.query("insert into auth.users(id) values($1)", [id]);
  await db.query("update profiles set role='moderator' where id=$1", [ids[2]]);
  await db.query("update profiles set role='admin' where id=$1", [ids[3]]);
  const feature = (
    await db.query<{ id: string }>("select id from features where slug='tokon'")
  ).rows[0].id;
  const as = async (id: string | null, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id ?? "",
    ]);
    await db.exec(`set role ${role}`);
  };
  const payload = {
    feature_id: feature,
    type: "Tip",
    target_section: "Practice",
    title: "Use deliberate practice",
    body: "Repeat one useful situation before adding more tasks.",
  };
  await as(ids[0]);
  const cid = (
    await db.query<{ id: string }>("select save_contribution($1::jsonb) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  await assert.rejects(
    db.query("update profiles set role='admin' where id=$1", [ids[0]]),
  );
  await assert.rejects(
    db.query(
      "select moderate_contribution($1,'Accepted','Approved heading','A sufficiently long edited contribution body.')",
      [cid],
    ),
  );
  await assert.rejects(
    db.query("select grant_open_panel_role($1,'admin')", [ids[0]]),
  );
  await as(ids[1]);
  assert.equal((await db.query("select * from contributions")).rows.length, 0);
  await assert.rejects(
    db.query("select save_contribution($1::jsonb,$2)", [
      JSON.stringify(payload),
      cid,
    ]),
  );
  await as(null, "anon");
  assert.equal(
    (await db.query("select * from published_additions")).rows.length,
    0,
  );
  await assert.rejects(db.query("select * from profiles"));
  assert.equal(
    (await db.query("select * from public_profiles")).fields.some(
      (f) => f.name === "role",
    ),
    false,
  );
  await as(ids[2]);
  await assert.rejects(
    db.query("select moderate_contribution($1,'Accepted','bad','short')", [
      cid,
    ]),
  );
  assert.equal(
    (
      await db.query<{ current_revision: number }>(
        "select current_revision from features where id=$1",
        [feature],
      )
    ).rows[0].current_revision,
    1,
  );
  assert.equal(
    (await db.query("select * from published_additions")).rows.length,
    0,
  );
  await db.query(
    "select moderate_contribution($1,'Accepted','Edited practice heading','Curated text that is long enough for publication.','Verified.')",
    [cid],
  );
  await assert.rejects(
    db.query(
      "select moderate_contribution($1,'Accepted','Another heading','Another contribution with enough detail.')",
      [cid],
    ),
  );
  await as(ids[0]);
  await assert.rejects(
    db.query("select save_contribution($1::jsonb,$2)", [
      JSON.stringify(payload),
      cid,
    ]),
  );
  await assert.rejects(db.query("select withdraw_contribution($1)", [cid]));
  const second = (
    await db.query<{ id: string }>("select save_contribution($1::jsonb) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  await as(ids[2]);
  await db.query(
    "select moderate_contribution($1,'Changes Requested','','','Please include a source.')",
    [second],
  );
  await as(ids[0]);
  await db.query("select save_contribution($1::jsonb,$2)", [
    JSON.stringify(payload),
    second,
  ]);
  await db.query("select withdraw_contribution($1)", [second]);
  await as(null, "anon");
  const additions = (
    await db.query<{ heading: string; contributor_id: string }>(
      "select * from published_additions",
    )
  ).rows;
  assert.equal(additions.length, 1);
  assert.equal(additions[0].heading, "Edited practice heading");
  assert.equal(additions[0].contributor_id, ids[0]);
  assert.equal(
    (await db.query("select * from revisions where feature_id=$1", [feature]))
      .rows.length,
    2,
  );
  await as(ids[3]);
  await db.query("select grant_open_panel_role($1,'moderator')", [ids[1]]);
  assert.equal((await db.query("select * from role_audit")).rows.length, 1);
  await db.exec("reset role;set open_panel.allow_demo_seed='true'");
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  assert.ok(
    (
      await db.query("select * from published_additions where feature_id=$1", [
        feature,
      ])
    ).rows.length >= 6,
  );
  await db.close();
});
