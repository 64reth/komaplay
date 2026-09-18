import assert from "node:assert/strict";
import test from "node:test";
import { publicationFixture } from "../fixtures/publication.ts";
import {
  archiveIssues,
  filterFeatures,
  stripItems,
} from "../../router-app/lib/publication.ts";
import { handbookPanels } from "../../router-app/lib/handbook.ts";
import handbook from "../../router-app/data/handbook-v1.json" with { type: "json" };
import { trustedVideo } from "../../router-app/lib/media.ts";
test("every public feature slug resolves in the catalogue", () => {
  const d = publicationFixture("2026-09-12T00:00:00Z");
  for (const slug of [
    "first",
    "second",
    "guide",
    "animation",
    "demo-the-painted-frame",
  ])
    assert.ok(d.features.some((f) => f.slug === slug));
});
test("search and taxonomy filters preserve their contracts", () => {
  const d = publicationFixture("2026-09-12T00:00:00Z");
  assert.deepEqual(
    filterFeatures(d, { q: "playing" }).map((f) => f.slug),
    ["guide"],
  );
  assert.ok(
    filterFeatures(d, { category: "anime" }).every(
      (f) => f.category_id === "anime",
    ),
  );
  assert.deepEqual(
    filterFeatures(d, { format: "guide" }).map((f) => f.slug),
    ["guide"],
  );
  assert.deepEqual(
    filterFeatures(d, { tag: "guide" }).map((f) => f.slug),
    ["guide"],
  );
  assert.equal(filterFeatures(d, { q: "no-such-panel" }).length, 0);
});
test("current and archived issue selection is public and ordered", () => {
  const d = publicationFixture("2026-09-12T00:00:00Z");
  assert.equal(
    d.issues.find((i) => i.status === "current")?.slug,
    "issue-zero-september-2026",
  );
  assert.deepEqual(
    archiveIssues(d, {}).map((i) => i.slug),
    ["demo-archive-august-2026"],
  );
  assert.deepEqual(
    stripItems(d, d.drops[0]).map((x) => x.id),
    ["first", "second", "guide", "animation"],
  );
});
test("the protected handbook parses into exactly four public panels", () => {
  const panels = handbookPanels(handbook.content);
  assert.equal(panels?.length, 4);
  assert.ok(panels?.every(Boolean));
});
test("video providers use trusted privacy-preserving adapters", () => {
  assert.match(
    trustedVideo("https://youtube.com/watch?v=dQw4w9WgXcQ")!.embed,
    /youtube-nocookie/,
  );
  assert.equal(trustedVideo("https://example.com/embed"), null);
});

test("feature image fallback uses the KOMA placeholder only when image data is missing", async () => {
  const { KOMA_FEATURE_PLACEHOLDER, KOMA_FEATURE_PLACEHOLDER_ALT } = await import("../../router-app/lib/publication-media.ts");
  const d = publicationFixture("2026-09-12T00:00:00Z");
  const drop = d.drops[0];
  const missing = { ...d.features[0], image: "", image_alt: "" };
  const existing = { ...d.features[1], image: "/assets/clue-gun.png", image_alt: "Existing art" };
  const items = stripItems(d, drop, [missing, existing]);
  assert.equal(items[0].image, KOMA_FEATURE_PLACEHOLDER);
  assert.equal(items[0].imageAlt, KOMA_FEATURE_PLACEHOLDER_ALT);
  assert.equal(items[1].image, "/assets/clue-gun.png");
  assert.equal(items[1].imageAlt, "Existing art");
});

test("broken editorial placeholder paths resolve to the canonical placeholder", async () => {
  const { KOMA_FEATURE_PLACEHOLDER, resolvePublicMediaPath } = await import("../../router-app/lib/publication-media.ts");
  assert.equal(resolvePublicMediaPath("/assets/koma-vhs-v2.svg"), KOMA_FEATURE_PLACEHOLDER);
});
