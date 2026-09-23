import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/202609230001_four_eyes_editorial_workflow.sql";

test("canonical approval rejects the author and submitter in the trusted RPC", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /auth\.uid\(\)=doc\.author_id or auth\.uid\(\)=coalesce\(doc\.submitted_by,doc\.author_id\)/);
  assert.match(sql, /raise exception 'Independent review required'/);
  assert.match(sql, /reviewed_by=auth\.uid\(\),reviewed_at=now\(\)/);
  assert.match(sql, /Independent approval is required before publication/);
});

test("Open Panel acceptance is independent and no longer publishes immediately", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const moderation = sql.slice(sql.indexOf("create or replace function public.moderate_contribution"), sql.indexOf("alter table public.contributions add column"));
  assert.match(moderation, /c\.author_id=auth\.uid\(\)/);
  assert.doesNotMatch(moderation, /published_additions|panel_citations|current_revision/);
  assert.match(moderation, /decision='Rejected' then 'Declined'/);
});

test("incorporation has prepare, independent review and separate publication boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.contribution_incorporations/);
  assert.match(sql, /create or replace function public\.prepare_contribution_incorporation/);
  assert.match(sql, /auth\.uid\(\) in \(c\.author_id,incorporation\.prepared_by,incorporation\.submitted_by\)/);
  assert.match(sql, /create or replace function public\.publish_contribution_incorporation/);
  assert.match(sql, /insert into public\.panel_citations/);
  assert.match(sql, /insert into public\.published_additions/);
});

test("submitted contributions are frozen until changes are requested", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /current_status is distinct from 'Changes Requested'/);
  assert.match(sql, /Only a changes-requested contribution can be revised/);
  const client = await readFile("router-app/components/open-panel/WorkshopClient.tsx", "utf8");
  assert.match(client, /REVISE AND RESUBMIT/);
  assert.match(client, /ACCEPTED · AWAITING EDITORIAL INCORPORATION/);
  assert.match(client, /INCORPORATED \/ PUBLISHED/);
});

test("moderation provides an obvious Open Panel queue and hides self-approval controls", async () => {
  const route = await readFile("router-app/routes/moderation.tsx", "utf8");
  assert.match(route, /open_panel_review_inbox/);
  assert.match(route, /Community contribution inbox/);
  assert.match(route, /Independent review required/);
  assert.match(route, /ACCEPT/);
  assert.match(route, /REQUEST CHANGES/);
  assert.match(route, /DECLINE/);
  assert.match(route, /contribution_incorporation_inbox/);
});

test("the migration is non-destructive to historical editorial and attribution rows", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(contributions|published_additions|panel_citations|revisions)/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.match(sql, /add column if not exists incorporated_at/);
});
