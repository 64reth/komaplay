import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Feature Strip uses React Router links", async () => {
  const strip = await readFile(
    "router-app/components/FeatureStrip.tsx",
    "utf8",
  );
  assert.match(strip, /from "react-router"/);
  assert.doesNotMatch(strip, /next\//);

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
