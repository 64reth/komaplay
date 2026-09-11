import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { GateState } from "../components/open-panel/AuthGate";
import {
  ContributorCredits,
  CommunityAdditions,
} from "../components/open-panel/PublishedPanel";
import {
  contributionSchema,
  canModerate,
  canEdit,
  canTransition,
  safeMedia,
  screenshotError,
  publishedCredits,
  type Addition,
} from "../lib/open-panel/domain";
const valid = {
  feature_id: "11111111-1111-4111-8111-111111111111",
  type: "Tip",
  target_section: "Practice",
  title: "Practice deliberately",
  body: "Choose one situation and repeat it until the response feels clear.",
};
test("Workshop gates signed-out and loading states; only moderators/admins see moderation", () => {
  for (const state of [
    "signed-out",
    "loading",
    "member",
    "contributor",
    "moderator",
    "admin",
  ] as const) {
    const html = renderToStaticMarkup(
      <GateState state={state} moderator>
        <b>private queue</b>
      </GateState>,
    );
    assert.equal(html.includes("private queue"), canModerate(state));
  }
  assert.match(
    renderToStaticMarkup(
      <GateState state="member">
        <b>composer</b>
      </GateState>,
    ),
    /composer/,
  );
});
test("credits use a native disclosure only above four names", () => {
  const credits = Array.from({ length: 6 }, (_, i) => ({
    id: String(i),
    display_name: `Reader ${i}`,
  }));
  const html = renderToStaticMarkup(<ContributorCredits credits={credits} />);
  assert.match(html, /<details>/);
  assert.match(html, /\+ 2 more/);
  assert.doesNotMatch(
    renderToStaticMarkup(<ContributorCredits credits={credits.slice(0, 4)} />),
    /<details>/,
  );
});
test("structured validation rejects unsafe links, media, short text and missing screenshot", () => {
  assert.equal(contributionSchema.safeParse(valid).success, true);
  for (const extra of [
    { body: "short" },
    { type: "Unknown" },
    { source_url: "javascript:alert(1)" },
    { media_url: "https://youtube.com.evil.test/x" },
    { source_url: "https://user:pass@example.com" },
    { type: "Screenshot" },
  ])
    assert.equal(
      contributionSchema.safeParse({ ...valid, ...extra }).success,
      false,
    );
  assert.equal(safeMedia("https://youtu.be/example"), true);
  assert.ok(screenshotError({ size: 6 * 1024 * 1024, type: "image/png" }));
  assert.ok(screenshotError({ size: 100, type: "image/svg+xml" }));
});
test("accepted/rejected decisions are final; members edit only eligible submissions", () => {
  assert.equal(canEdit("Accepted"), false);
  assert.equal(canEdit("Changes Requested"), true);
  assert.equal(canTransition("Accepted", "Submitted"), false);
  assert.equal(canTransition("Rejected", "Accepted"), false);
  assert.equal(canTransition("Submitted", "Accepted"), true);
});
test("public additions and unique credits derive only from curated records", () => {
  const additions: Addition[] = [
    {
      id: "a",
      contribution_id: "c",
      heading: "Curated heading",
      body: "Edited material for publication.",
      target_section: "Practice",
      contributor_id: "u",
      revision_number: 2,
      published_at: "2026-09-10",
      contributor: { id: "u", display_name: "Kai" },
    },
  ];
  assert.equal(publishedCredits([...additions, ...additions]).length, 1);
  const html = renderToStaticMarkup(
    <CommunityAdditions additions={additions} />,
  );
  assert.match(html, /Curated heading/);
  assert.match(html, /Contributed by Kai/);
  assert.doesNotMatch(
    renderToStaticMarkup(<CommunityAdditions additions={[]} />),
    /Curated heading/,
  );
});

test("weekly drop components render independent connected strips from configuration", async () => {
  const { WeeklyDropStrip } =
    await import("../components/publication/WeeklyDropStrip");
  const { developmentCatalogue } = await import("../data/publication-demo");
  const data = developmentCatalogue("2026-09-10T12:00:00Z");
  const original = data.drops[0];
  const drops = Array.from({ length: 4 }, (_, i) => ({
    ...original,
    id: `week-${i}`,
    week_number: i + 1,
    label: `Frame ${i + 1}`,
  }));
  const features = drops.flatMap((drop, i) =>
    data.features
      .slice(0, 4)
      .map((f) => ({ ...f, id: `${f.id}-${i}`, weekly_drop_id: drop.id })),
  );
  const catalogue = { ...data, drops, features };
  const html = renderToStaticMarkup(
    <>
      {drops.map((drop) => (
        <WeeklyDropStrip key={drop.id} data={catalogue} drop={drop} />
      ))}
    </>,
  );
  assert.equal((html.match(/class="feature-rail"/g) ?? []).length, 4);
  assert.equal((html.match(/class="feature-panel /g) ?? []).length, 16);
  assert.equal((html.match(/aria-label="Next features"/g) ?? []).length, 4);
});
