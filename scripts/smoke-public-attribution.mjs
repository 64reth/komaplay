// Browser uses the actual output of the complete SQL migration/RLS fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler/package.json"))(
    "esbuild",
  ),
  { chromium } = require("@playwright/test");
const directory = await mkdtemp(join(tmpdir(), "koma-public-attribution-")),
  fixturePath = join(directory, "public.json");
let browser;
try {
  execFileSync(
    process.execPath,
    ["--import", "tsx", "--test", "tests/migration/trust-continuity.test.ts"],
    {
      env: { ...process.env, KOMA_PRIVACY_FIXTURE_OUT: fixturePath },
      stdio: "pipe",
    },
  );
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router';
import {CommunityAdditions,RevisionHistory} from './router-app/components/open-panel/PublishedPanel';
const data=${JSON.stringify(fixture)};
const additions=data.rows.map(row=>({...row,contributor:row.credit_id?{id:row.credit_id,display_name:row.public_credit}:undefined}));
createRoot(document.getElementById('root')).render(<MemoryRouter><main className="editorial-page"><CommunityAdditions additions={additions} citations={data.citations}/><RevisionHistory revisions={data.revisions} credits={data.profiles}/></main></MemoryRouter>);
`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = await readFile("router-app/app.css", "utf8"),
    html = `<style>${css}</style><div id="root"></div><script id="route-data" type="application/json">${JSON.stringify(fixture)}</script><script>${bundle.outputFiles[0].text}</script>`;
  const forbidden = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000099",
    "Private Account Name",
    "open-panel-screenshots",
    "author_id",
    "owner_id",
    "publishing_moderator",
  ];
  for (const value of forbidden)
    assert.ok(!JSON.stringify(fixture).includes(value));
  browser = await chromium.launch();
  const page = await browser.newPage();
  const requests = [],
    errors = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://fixture.test/**", (route) =>
    route.request().url().includes("/api/public-media/")
      ? route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
      : route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("https://fixture.test/");
  await page.getByRole("heading", { name: "Community Additions" }).waitFor();
  const articles = page.locator(".op-addition");
  assert.match(await articles.nth(0).innerText(), /Anonymous Panelist/);
  assert.match(await articles.nth(1).innerText(), /Published Pen/);
  await page.locator(".op-history summary").click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Overflow at " + width,
    );
    for (const value of forbidden)
      assert.ok(!(await page.content()).includes(value));
  }
  for (const value of forbidden)
    assert.ok(!requests.join("\n").includes(value));
  assert.equal(await page.locator("img").count(), 2);
  assert.ok(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((i) => i.complete && i.naturalWidth > 0),
      ),
  );
  assert.ok(
    requests.filter((r) => r.includes("/api/public-media/")).length === 2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: SQL-generated anonymous/named attribution, revision history, serialized data, DOM and opaque image requests at 390px/1440px. Image transport fixture; gateway bytes and RLS checked separately.",
  );
} finally {
  if (browser) await browser.close();
  await rm(directory, { recursive: true, force: true });
}
