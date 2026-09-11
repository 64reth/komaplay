import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("publication database enforces deadlines, private corrections, permissions, idempotency and carry-over", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert on storage.objects to anon,authenticated;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  for (const path of [
    "202609100001_open_panel.sql",
    "202609100002_publication_lifecycle.sql",
    "202609100003_community_handbook.sql",
    "202609110004_community_edition_workshop.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${path}`, "utf8"));
  const [member, other, moderator, admin] = Array.from({ length: 4 }, () =>
    crypto.randomUUID(),
  );
  for (const id of [member, other, moderator, admin])
    await db.query("insert into auth.users(id) values($1)", [id]);
  await db.query("update profiles set role='moderator' where id=$1", [
    moderator,
  ]);
  await db.query("update profiles set role='admin' where id=$1", [admin]);
  await db.exec(
    "update issues set opens_at=now()-interval '1 day',closes_at=now()+interval '2 days';update features set published_at=now()-interval '1 hour';update weekly_drops set published_at=now()-interval '1 hour'",
  );
  const feature = (
    await db.query<{ id: string }>("select id from features limit 1")
  ).rows[0].id;
  const issue = (
    await db.query<{ id: string }>("select id from issues limit 1")
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
    title: "A useful contribution",
    body: "A detailed practice suggestion for a beginner.",
    public_credit: "Display name",
    publication_consent: true,
  };
  await as(member);
  await assert.rejects(
    db.query("select save_contribution($1::jsonb)", [JSON.stringify(payload)]),
  );
  for (const id of [member, other, moderator, admin]) {
    await as(id);
    const handbook = (
      await db.query<{
        id: string;
        content_hash: string;
        statement_version: string;
      }>(
        "select id,content_hash,statement_version from handbook_versions where active",
      )
    ).rows[0];
    await db.query("select accept_handbook($1,$2,$3,true)", [
      handbook.id,
      handbook.content_hash,
      handbook.statement_version,
    ]);
  }
  await as(member);
  const c = (
    await db.query<{ id: string }>("select save_contribution($1::jsonb) id", [
      JSON.stringify(payload),
    ])
  ).rows[0].id;
  await assert.rejects(db.query("select reconcile_publication()"));
  await assert.rejects(
    db.query(
      'select manage_publication(\'category\',\'{"name":"Exploit","slug":"exploit"}\')',
    ),
  );
  await as(admin);
  await db.query("select reconcile_publication()");
  assert.equal(
    (
      await db.query<{ lifecycle_status: string }>(
        "select lifecycle_status from features where id=$1",
        [feature],
      )
    ).rows[0].lifecycle_status,
    "closing_panel",
  );
  const dueDrop = (
    await db.query<{ id: string }>(
      "select manage_publication('drop',$1::jsonb) id",
      [
        JSON.stringify({
          issue_id: issue,
          week_number: 2,
          label: "Due scheduled frame",
          status: "scheduled",
          scheduled_at: new Date(Date.now() - 60000).toISOString(),
          display_order: 2,
        }),
      ],
    )
  ).rows[0].id;
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from weekly_drops where id=$1",
        [dueDrop],
      )
    ).rows[0].status,
    "scheduled",
  );
  await db.query("select reconcile_publication()");
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from weekly_drops where id=$1",
        [dueDrop],
      )
    ).rows[0].status,
    "published",
  );
  const lateDrop = (
    await db.query<{ id: string }>(
      "select manage_publication('drop',$1::jsonb) id",
      [
        JSON.stringify({
          issue_id: issue,
          week_number: 3,
          label: "Late scheduled frame",
          status: "scheduled",
          scheduled_at: new Date(Date.now() + 600000).toISOString(),
          display_order: 3,
        }),
      ],
    )
  ).rows[0].id;
  const draftIssue = {
    issue_number: 2,
    slug: "next-issue",
    title: "Next issue",
    year: 2026,
    month: 11,
    opens_at: new Date(Date.now() + 86400000).toISOString(),
    closes_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    closing_days: 7,
  };
  const next = (
    await db.query<{ id: string }>(
      "select manage_publication('issue',$1::jsonb) id",
      [JSON.stringify(draftIssue)],
    )
  ).rows[0].id;
  await assert.rejects(
    db.query("select manage_publication('issue-state',$1::jsonb)", [
      JSON.stringify({ id: next, status: "current" }),
    ]),
  );
  const drop = (
    await db.query<{ id: string }>(
      "select manage_publication('drop',$1::jsonb) id",
      [
        JSON.stringify({
          issue_id: next,
          week_number: 1,
          label: "Next frame",
          status: "draft",
          display_order: 1,
        }),
      ],
    )
  ).rows[0].id;
  const sourceDrop = (
    await db.query<{ id: string }>(
      "select id from weekly_drops where issue_id=$1",
      [issue],
    )
  ).rows[0].id;
  const category = (
    await db.query<{ id: string }>("select id from categories limit 1")
  ).rows[0].id;
  const format = (
    await db.query<{ id: string }>("select id from content_formats limit 1")
  ).rows[0].id;
  const draft = {
    slug: "carry-me",
    title: "An unpublished feature",
    issue_id: issue,
    weekly_drop_id: sourceDrop,
    strip_position: 4,
    category_id: category,
    format_id: format,
    lifecycle_status: "draft",
  };
  const draftId = (
    await db.query<{ id: string }>(
      "select manage_publication('feature',$1::jsonb) id",
      [JSON.stringify(draft)],
    )
  ).rows[0].id;
  await db.query("select manage_publication('feature',$1::jsonb)", [
    JSON.stringify({
      ...draft,
      id: draftId,
      issue_id: next,
      weekly_drop_id: drop,
    }),
  ]);
  assert.equal(
    (
      await db.query<{ issue_id: string }>(
        "select issue_id from features where id=$1",
        [draftId],
      )
    ).rows[0].issue_id,
    next,
  );
  await db.exec(
    "reset role;update issues set closes_at=now()-interval '1 second' where issue_number=0",
  );
  await as(member);
  await assert.rejects(
    db.query("select save_contribution($1::jsonb)", [JSON.stringify(payload)]),
  );
  await assert.rejects(
    db.query("select save_contribution($1::jsonb,$2)", [
      JSON.stringify(payload),
      c,
    ]),
  );
  await assert.rejects(
    db.query("select save_contribution_before_lifecycle($1::jsonb)", [
      JSON.stringify(payload),
    ]),
  );
  await as(admin);
  await db.query("select reconcile_publication()");
  assert.equal(
    (
      await db.query<{ status: string }>(
        "select status from weekly_drops where id=$1",
        [lateDrop],
      )
    ).rows[0].status,
    "scheduled",
  );
  const snapshot = (
    await db.query("select status,updated_at from issues where id=$1", [issue])
  ).rows;
  await db.query("select reconcile_publication()");
  assert.deepEqual(
    (
      await db.query("select status,updated_at from issues where id=$1", [
        issue,
      ])
    ).rows,
    snapshot,
  );
  await as(moderator);
  await db.query(
    "select moderate_contribution($1,'Accepted','Final edited heading','A curated final addition after the deadline.','Final review complete.')",
    [c],
  );
  assert.equal(
    (await db.query("select * from panel_citations")).rows.length,
    1,
  );
  await assert.rejects(
    db.query("select manage_publication('issue-state',$1::jsonb)", [
      JSON.stringify({ id: issue, status: "archived" }),
    ]),
  );
  await as(admin);
  await db.query("select manage_publication('issue-state',$1::jsonb)", [
    JSON.stringify({ id: issue, status: "archived" }),
  ]);
  await as(member);
  await assert.rejects(
    db.query("select save_contribution($1::jsonb)", [JSON.stringify(payload)]),
  );
  const report = (
    await db.query<{ id: string }>(
      "select submit_correction($1,'Factual error','This factual detail needs checking against the original source.') id",
      [feature],
    )
  ).rows[0].id;
  await as(other);
  assert.equal(
    (await db.query("select * from correction_reports")).rows.length,
    0,
  );
  await as(null, "anon");
  await assert.rejects(db.query("select * from correction_reports"));
  assert.ok((await db.query("select * from published_additions")).rows.length);
  await as(member);
  for (let i = 0; i < 2; i++)
    await db.query(
      "select submit_correction($1,'Broken source','The linked source is no longer available at that address.')",
      [feature],
    );
  await assert.rejects(
    db.query(
      "select submit_correction($1,'Broken source','Another report over the hourly rate limit.')",
      [feature],
    ),
  );
  await as(moderator);
  await db.query(
    "select review_correction($1,'Resolved','Verified the report and recorded it for editorial follow-up.')",
    [report],
  );
  assert.equal(
    (
      await db.query("select * from correction_audit where report_id=$1", [
        report,
      ])
    ).rows.length,
    2,
  );
  // All seed scripts apply to a fresh migrated project, tested separately below.
  await db.close();
});
test("development publication seed provides four weeks, private scheduled drafts and archive", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  // Follow the documented setup: both migrations first, then both seeds.
  await db.exec(
    await readFile("supabase/migrations/202609100001_open_panel.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202609100002_publication_lifecycle.sql",
      "utf8",
    ),
  );
  await db.exec("set open_panel.allow_demo_seed='true'");
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  await db.exec(await readFile("supabase/seed-publication.sql", "utf8"));
  assert.equal(
    (
      await db.query(
        "select * from weekly_drops d join issues i on i.id=d.issue_id where i.issue_number=1",
      )
    ).rows.length,
    4,
  );
  assert.equal(
    (await db.query("select * from issues where status='current'")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from features where lifecycle_status='draft'"))
      .rows.length,
    1,
  );
  assert.equal(
    (
      await db.query<{ visible: boolean }>(
        "select feature_is_public(id) as visible from features where slug='tokon-next-session'",
      )
    ).rows[0].visible,
    false,
  );
  await db.close();
});
