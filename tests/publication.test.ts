import test from "node:test";
import assert from "node:assert/strict";
import { developmentCatalogue } from "../data/publication-demo";
import {
  deadline,
  panelState,
  acceptsContributions,
  orderedDrops,
  filterFeatures,
  archiveIssues,
} from "../lib/publication/domain";
const data = developmentCatalogue("2026-09-10T12:00:00Z");
const issue = data.issues[0];
const feature = data.features[0];
test("deadlines inherit issue UTC boundary and allow explicit override", () => {
  assert.equal(deadline(feature, issue), issue.closes_at);
  assert.equal(
    deadline({ ...feature, deadline_override: "2026-10-03T00:00:00Z" }, issue),
    "2026-10-03T00:00:00Z",
  );
  assert.equal(
    acceptsContributions(feature, issue, "2026-10-01T00:00:00Z"),
    false,
  );
  assert.equal(
    acceptsContributions(feature, issue, "2026-08-01T00:00:00Z"),
    false,
  );
});
test("Closing Panel starts exactly seven days before deadline, never closes draft", () => {
  assert.equal(
    panelState(feature, issue, "2026-09-23T23:59:59Z"),
    "open_panel",
  );
  assert.equal(
    panelState(feature, issue, "2026-09-24T00:00:00Z"),
    "closing_panel",
  );
  assert.equal(
    panelState(feature, issue, "2026-10-01T00:00:00Z"),
    "final_panel",
  );
  assert.equal(
    panelState(
      { ...feature, lifecycle_status: "draft" },
      issue,
      "2026-12-01T00:00:00Z",
    ),
    "draft",
  );
});
test("weekly drops preserve publication order, newest first on home", () => {
  const later = {
    ...data.drops[0],
    id: "later",
    published_at: "2026-09-17T00:00:00Z",
    display_order: 2,
  };
  assert.equal(orderedDrops([later, data.drops[0]])[0].id, data.drops[0].id);
  assert.equal(orderedDrops([later, data.drops[0]], true)[0].id, "later");
});
test("discovery combines category, format, topic, issue and state", () => {
  assert.equal(
    filterFeatures(data, { category: "gaming", format: "guide", tag: "tokon" })
      .length,
    1,
  );
  assert.equal(filterFeatures(data, { q: "Tōkon" }).length, 1);
  assert.equal(
    filterFeatures(data, { filter: "anime-manga", issue: issue.slug }).length,
    1,
  );
  assert.equal(filterFeatures(data, { status: "closed" }).length, 1);
});
test("archive filters retain only closed matching issues", () => {
  assert.equal(archiveIssues(data, { category: "anime" }).length, 1);
  assert.equal(archiveIssues(data, { category: "gaming" }).length, 0);
  assert.equal(archiveIssues(data, { tag: "retro-anime" }).length, 1);
});
