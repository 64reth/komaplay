import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { issueZeroFeatures } from "../../router-app/data/issue-zero.ts";

test("Phase 1 uses React Router links and the canonical Tokon route", async () => {
  const strip = await readFile(
    "router-app/components/FeatureStrip.tsx",
    "utf8",
  );
  assert.match(strip, /from "react-router"/);
  assert.doesNotMatch(strip, /next\//);
  assert.equal(
    issueZeroFeatures.find((item) => item.id === "tokon")?.image,
    "/assets/clue-shield.png",
  );
});

test("the canary Worker is isolated from production", async () => {
  const config = await readFile("wrangler.jsonc", "utf8");
  assert.match(config, /"name": "komaplay-canary"/);
  assert.doesNotMatch(config, /komaplay\.com/);
});

test("the migration production bundle has no Next or Vinext imports", async () => {
  const files = [
    "router-app/root.tsx",
    "router-app/components/Masthead.tsx",
    "router-app/components/FeatureStrip.tsx",
    "workers/app.ts",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from|import\()\s*["'](?:next|vinext)(?:\/|["'])/,
    );
  }
});
