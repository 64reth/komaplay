import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { contributionSchema, genericContributionSection } from "../../router-app/lib/open-panel";

const featureId = "11111111-1111-4111-8111-111111111111";

test("Workshop is feature-level and keeps the canonical structured tools", async () => {
  const [client, toolbar, domain] = await Promise.all([
    readFile("router-app/components/open-panel/WorkshopClient.tsx", "utf8"),
    readFile("router-app/components/WritingToolbar.tsx", "utf8"),
    readFile("router-app/lib/open-panel.ts", "utf8"),
  ]);
  assert.doesNotMatch(client, /Sections in this panel|Target section|ADD TO THIS SECTION/);
  assert.doesNotMatch(domain, /Choosing a fighter|Assists|Practice/);
  assert.match(client, /Contribution type/);
  assert.match(client, /Workshop contribution writing tools/);
  for (const tool of ["heading", "bullet", "numbered", "quote", "link", "divider"])
    assert.match(toolbar, new RegExp(`id: "${tool}"`));
  const parsed = contributionSchema.parse({
    feature_id: featureId,
    type: "Tip",
    title: "Feature-level proposal",
    body: "## Heading\n\nA structured contribution with enough useful detail.",
    publication_consent: true,
  });
  assert.equal(parsed.target_section, genericContributionSection);
  assert.equal(
    contributionSchema.safeParse({ ...parsed, target_section: "Practice" }).success,
    true,
    "historical section values remain readable",
  );
});

test("generic contribution migration is additive and preserves historical rows", async () => {
  const db = new PGlite();
  await db.exec(`create table public.contributions (
      id integer primary key,
      target_section text not null check(target_section in ('Overview','Choosing a fighter','Assists','Practice','Sources'))
    );
    insert into public.contributions values (1, 'Practice');`);
  const migration = await readFile(
    "supabase/migrations/202609220001_generic_workshop_contributions.sql",
    "utf8",
  );
  await db.exec(migration);
  await db.exec("insert into public.contributions(id) values (2)");
  const result = await db.query<{ id: number; target_section: string }>(
    "select id,target_section from public.contributions order by id",
  );
  assert.deepEqual(result.rows, [
    { id: 1, target_section: "Practice" },
    { id: 2, target_section: "Contribution" },
  ]);
  await db.close();
});

test("publication confirmation resets on success, retains failure and restores focus", async () => {
  const route = await readFile("router-app/routes/moderation.tsx", "utf8");
  assert.match(route, /"success" in actionResult && confirmation\) closeConfirmation\(\)/);
  assert.match(route, /"error" in actionResult && confirmation\) setConfirmationError/);
  assert.match(route, /confirmationTrigger\.current\?\.focus\(\)/);
  assert.match(route, /onClick=\{closeConfirmation\}/);
  assert.match(route, /confirmationDialog\.current\?\.querySelector/);
  assert.match(route, /CONFIRM PUBLISH/);
  assert.match(route, /CONFIRM TAKE DOWN/);
});

test("Feature Strip uses responsive non-overlapping title and artwork zones", async () => {
  const css = await readFile("router-app/app.css", "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, 56%\) minmax\(0, 44%\)/);
  assert.match(css, /\.feature-art \{[\s\S]*grid-column: 2/);
  assert.match(css, /\.feature-caption \{[\s\S]*grid-column: 1/);
  assert.match(css, /\.feature-caption strong \{[\s\S]*overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /\.feature-panel\.(?:tokon|vice|vhs) \.feature-(?:art|caption)/);
});
