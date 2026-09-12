import assert from "node:assert/strict";
import test from "node:test";
import { developmentCatalogue } from "../../router-app/data/publication-demo.ts";
import {
  archiveIssues,
  filterFeatures,
  stripItems,
} from "../../router-app/lib/publication.ts";
import { handbookPanels } from "../../router-app/lib/handbook.ts";
import handbook from "../../router-app/data/handbook-v1.json" with { type: "json" };
import { trustedVideo } from "../../router-app/lib/media.ts";
test("every public feature slug resolves in the catalogue", () => {
  const d = developmentCatalogue("2026-09-12T00:00:00Z");
  for (const slug of [
    "time",
    "vice",
    "tokon",
    "afterimage",
    "demo-the-painted-frame",
  ])
    assert.ok(d.features.some((f) => f.slug === slug));
});
test("search and taxonomy filters preserve their contracts", () => {
  const d = developmentCatalogue("2026-09-12T00:00:00Z");
  assert.deepEqual(
    filterFeatures(d, { q: "Tōkon" }).map((f) => f.slug),
    ["tokon"],
  );
  assert.ok(
    filterFeatures(d, { category: "anime" }).every(
      (f) => f.category_id === "anime",
    ),
  );
  assert.deepEqual(
    filterFeatures(d, { format: "guide" }).map((f) => f.slug),
    ["tokon"],
  );
  assert.deepEqual(
    filterFeatures(d, { tag: "tokon" }).map((f) => f.slug),
    ["tokon"],
  );
  assert.equal(filterFeatures(d, { q: "no-such-panel" }).length, 0);
});
test("current and archived issue selection is public and ordered", () => {
  const d = developmentCatalogue("2026-09-12T00:00:00Z");
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
    ["time", "vice", "tokon", "afterimage"],
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
