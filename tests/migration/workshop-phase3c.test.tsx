import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { WorkshopInvitation } from "../../router-app/components/open-panel/WorkshopInvitation";
import {
  contributionSchema,
  screenshotError,
} from "../../router-app/lib/open-panel";
import {
  privateWorkshopAllowed,
  workshopAccess,
} from "../../router-app/lib/workshop";

const valid = {
  feature_id: "00000000-0000-4000-8000-000000000001",
  type: "Strategy",
  target_section: "Practice",
  title: "Keep one resource available",
  body: "Holding one resource makes defensive practice much easier.",
  source_url: "https://example.com/source",
  media_url: "https://www.youtube.com/watch?v=test",
  screenshot_path: "",
  public_credit: "Anonymous Panelist",
  publication_consent: true,
};

test("Workshop access never permits private reads before accepted active membership", () => {
  assert.equal(
    workshopAccess({ auth: "signed-out", open: true }),
    "signed-out",
  );
  assert.equal(
    workshopAccess({
      auth: "authenticated",
      account: "active",
      handbook: "required",
      open: true,
    }),
    "onboarding",
  );
  assert.equal(
    workshopAccess({
      auth: "authenticated",
      account: "restricted",
      handbook: "accepted",
      open: true,
    }),
    "blocked",
  );
  assert.equal(
    workshopAccess({
      auth: "authenticated",
      account: "suspended",
      handbook: "accepted",
      open: true,
    }),
    "blocked",
  );
  assert.equal(privateWorkshopAllowed("onboarding"), false);
  assert.equal(privateWorkshopAllowed("member"), true);
  assert.equal(
    workshopAccess({
      auth: "authenticated",
      account: "active",
      handbook: "accepted",
      open: false,
    }),
    "closed",
  );
});

test("signed-out Workshop offers only its three purposeful entry actions", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <WorkshopInvitation slug="tokon" title="Tōkon" />
    </MemoryRouter>,
  );
  assert.match(html, />SIGN IN</);
  assert.match(html, />CREATE ACCOUNT</);
  assert.match(html, />RETURN TO COMMUNITY EDITION</);
  assert.match(html, /features\/tokon/);
  assert.doesNotMatch(html, /private screenshot|Your contributions/);
});

test("contribution validation requires explicit publication consent and trusted media", () => {
  assert.equal(contributionSchema.safeParse(valid).success, true);
  assert.equal(
    contributionSchema.safeParse({ ...valid, publication_consent: false })
      .success,
    false,
  );
  const omitted = { ...valid } as Record<string, unknown>;
  delete omitted.publication_consent;
  assert.equal(contributionSchema.safeParse(omitted).success, false);
  assert.equal(
    contributionSchema.safeParse({
      ...valid,
      media_url: "https://evil.example/embed",
    }).success,
    false,
  );
  assert.equal(
    contributionSchema.safeParse({
      ...valid,
      media_url: "https://clips.twitch.tv/example",
    }).success,
    true,
  );
});

test("screenshot validation enforces the existing type and five-megabyte cap", () => {
  assert.equal(
    screenshotError({ type: "image/png", size: 5 * 1024 * 1024 }),
    null,
  );
  assert.match(
    screenshotError({ type: "image/png", size: 5 * 1024 * 1024 + 1 }) ?? "",
    /5 MB/,
  );
  assert.match(
    screenshotError({ type: "image/gif", size: 10 }) ?? "",
    /PNG, JPEG or WebP/,
  );
});

test("Workshop actions retain server membership, feature and duplicate boundaries", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "router-app/routes/workshop-action.tsx",
    "utf8",
  );
  assert.match(source, /membershipState/);
  assert.match(source, /feature_accepts_contributions/);
  assert.match(source, /save_contribution/);
  assert.match(source, /withdraw_contribution/);
  assert.match(source, /\.gte\("created_at"/);
  assert.match(source, /open-panel-screenshots/);
});
