import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile("supabase/migrations/202609230001_four_eyes_editorial_workflow.sql", "utf8");
const ids = {
  author: "00000000-0000-4000-8000-000000000001",
  reviewer: "00000000-0000-4000-8000-000000000002",
  secondReviewer: "00000000-0000-4000-8000-000000000003",
  feature: "10000000-0000-4000-8000-000000000001",
  contribution: "20000000-0000-4000-8000-000000000001",
};

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table profiles(id uuid primary key,display_name text,role text,account_status text default 'active');
    create table features(id uuid primary key,title text,slug text,status text default 'draft',lifecycle_status text default 'draft',summary text default '',image text default '',image_alt text default '',weekly_drop_id uuid,strip_position int default 999,published_at timestamptz,updated_at timestamptz default now(),current_revision int default 1);
    create table editorial_documents(feature_id uuid primary key references features,id serial, schema_version int default 1,working_document jsonb,revision_token uuid default gen_random_uuid(),author_id uuid references profiles,lifecycle_status text,updated_at timestamptz default now(),submitted_at timestamptz);
    create table editorial_document_snapshots(id uuid default gen_random_uuid(),feature_id uuid,schema_version int,document jsonb,reason text,created_by uuid,created_at timestamptz default now());
    create table contributions(id uuid primary key,feature_id uuid references features,author_id uuid references profiles,type text,target_section text,title text,body text,screenshot_path text default '',media_url text default '',source_url text default '',status text default 'Submitted',moderator_note text,moderator_id uuid,created_at timestamptz default now(),updated_at timestamptz default now(),reviewed_at timestamptz,withdrawn_at timestamptz,public_credit text default 'Display name',publication_consent boolean default true);
    create table moderation_audit(id uuid default gen_random_uuid(),contribution_id uuid,action text,previous_status text,new_status text,actor_id uuid,note text,created_at timestamptz default now());
    create table published_additions(id uuid default gen_random_uuid(),contribution_id uuid unique,feature_id uuid,heading text,body text,target_section text,display_order int,contributor_id uuid,publishing_moderator uuid,revision_number int,screenshot_path text,media_url text,source_url text,published_at timestamptz default now());
    create table revisions(id uuid default gen_random_uuid(),feature_id uuid,revision_number int,summary text,contributor_ids uuid[] default '{}',created_at timestamptz default now());
    create table panel_citations(id uuid default gen_random_uuid(),contribution_id uuid unique,feature_id uuid,public_credit text,contribution_type text,source_url text,submitted_at timestamptz,reviewing_editor text,published_at timestamptz default now(),revision_number int,editorial_summary text);
    create function require_handbook_acceptance() returns void language plpgsql as $$begin end$$;
    create function editorial_has_access(target uuid,review boolean default false) returns boolean language sql stable as $$select true$$;
    create function open_panel_role() returns text language sql stable as $$select role from public.profiles where id=auth.uid()$$;
    create function save_contribution(payload jsonb,contribution_id uuid default null) returns uuid language plpgsql as $$begin update public.contributions set title=payload->>'title',body=payload->>'body',status='Submitted',updated_at=now() where id=contribution_id; return contribution_id; end$$;
    insert into profiles values ('${ids.author}','Author','admin','active'),('${ids.reviewer}','Reviewer','moderator','active'),('${ids.secondReviewer}','Second reviewer','moderator','active');
    insert into features(id,title,slug,status,lifecycle_status,summary) values('${ids.feature}','Fixture','fixture','published','open_panel','Fixture summary');
    insert into editorial_documents(feature_id,working_document,author_id,lifecycle_status,submitted_at) values('${ids.feature}','{}','${ids.author}','submitted',now());
    insert into contributions(id,feature_id,author_id,type,target_section,title,body) values('${ids.contribution}','${ids.feature}','${ids.author}','Tip','Contribution','Useful proposal','A useful proposal with enough detail for review.');
  `);
  await db.exec(migration);
  return db;
}

const as = (db: PGlite, actor: string) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);

test("crafted Open Panel self-approval fails while an independent reviewer succeeds without publishing", async () => {
  const db = await fixture();
  try {
    await as(db, ids.author);
    await assert.rejects(db.query("select moderate_contribution($1,'Accepted','','','')", [ids.contribution]), /Independent review required/);
    await as(db, ids.reviewer);
    await db.query("select moderate_contribution($1,'Accepted','','','Suitable for incorporation')", [ids.contribution]);
    assert.equal((await db.query<{status:string}>("select status from contributions where id=$1", [ids.contribution])).rows[0].status, "Accepted");
    assert.equal((await db.query<{n:number}>("select count(*)::int n from published_additions")).rows[0].n, 0);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from panel_citations")).rows[0].n, 0);
  } finally { await db.close(); }
});

test("changes requested can be revised and resubmitted, while submitted work stays frozen", async () => {
  const db = await fixture();
  try {
    await as(db, ids.reviewer);
    await db.query("select moderate_contribution($1,'Changes Requested','','','Add a source')", [ids.contribution]);
    await as(db, ids.author);
    await db.query("select save_contribution($1,$2)", [{title:"Revised proposal",body:"A revised proposal with a supporting source."}, ids.contribution]);
    assert.equal((await db.query<{status:string}>("select status from contributions where id=$1", [ids.contribution])).rows[0].status, "Submitted");
    await assert.rejects(db.query("select save_contribution($1,$2)", [{title:"Silent edit",body:"This edit must not be accepted while submitted."}, ids.contribution]), /Only a changes-requested contribution can be revised/);
  } finally { await db.close(); }
});

test("decline is retained as contributor-visible history", async () => {
  const db = await fixture();
  try {
    await as(db, ids.reviewer);
    await db.query("select moderate_contribution($1,'Rejected','','','Outside the panel scope')", [ids.contribution]);
    const row = (await db.query<{status:string;moderator_note:string}>("select status,moderator_note from contributions where id=$1", [ids.contribution])).rows[0];
    assert.deepEqual(row, {status:"Rejected",moderator_note:"Outside the panel scope"});
    assert.equal((await db.query<{action:string}>("select action from moderation_audit where contribution_id=$1 order by created_at desc limit 1", [ids.contribution])).rows[0].action, "Declined");
  } finally { await db.close(); }
});

test("accepted work requires separate preparation and independent incorporation approval before attributed publication", async () => {
  const db = await fixture();
  try {
    await as(db, ids.reviewer);
    await db.query("select moderate_contribution($1,'Accepted','','','Suitable')", [ids.contribution]);
    await db.query("select prepare_contribution_incorporation($1,$2,$3,$4)", [ids.contribution,"Edited heading","Edited incorporated contribution with useful context.","Prepared deliberately"]);
    await assert.rejects(db.query("select review_contribution_incorporation($1,'approve','')", [ids.contribution]), /Independent review required/);
    await as(db, ids.secondReviewer);
    await db.query("select review_contribution_incorporation($1,'approve','')", [ids.contribution]);
    await db.query("select publish_contribution_incorporation($1)", [ids.contribution]);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from published_additions where contribution_id=$1", [ids.contribution])).rows[0].n, 1);
    assert.equal((await db.query<{n:number}>("select count(*)::int n from panel_citations where contribution_id=$1", [ids.contribution])).rows[0].n, 1);
    assert.ok((await db.query<{incorporated_at:string}>("select incorporated_at from contributions where id=$1", [ids.contribution])).rows[0].incorporated_at);
  } finally { await db.close(); }
});

test("canonical author/admin cannot approve own submission, including after returned resubmission", async () => {
  const db = await fixture();
  try {
    await as(db, ids.author);
    await assert.rejects(db.query("select editorial_review_draft($1,'approve','')", [ids.feature]), /Independent review required/);
    await as(db, ids.reviewer);
    await db.query("select editorial_review_draft($1,'changes','Clarify the ending')", [ids.feature]);
    await as(db, ids.author);
    await db.query("update editorial_documents set lifecycle_status='submitted' where feature_id=$1", [ids.feature]);
    await assert.rejects(db.query("select editorial_review_draft($1,'approve','')", [ids.feature]), /Independent review required/);
    await as(db, ids.reviewer);
    await db.query("select editorial_review_draft($1,'approve','')", [ids.feature]);
    const row=(await db.query<{lifecycle_status:string;reviewed_by:string}>("select lifecycle_status,reviewed_by from editorial_documents where feature_id=$1",[ids.feature])).rows[0];
    assert.equal(row.lifecycle_status,"approved");
    assert.equal(row.reviewed_by,ids.reviewer);
  } finally { await db.close(); }
});
