import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("reserved application paths cannot be captured by a public publication loader", async () => {
  const routes = await readFile("router-app/routes.ts", "utf8");
  const admin = routes.indexOf('route("admin", "routes/admin.tsx")');
  const fallback = routes.indexOf('route("*", "routes/not-found.tsx")');
  assert.ok(admin >= 0 && fallback > admin, "the explicit admin route must precede the 404 fallback");
  assert.doesNotMatch(routes, /route\("[:$][^"/]+"/i, "no top-level dynamic publication route may capture reserved paths");
  for (const path of ["admin", "moderation", "editorial", "profile", "auth/callback"])
    assert.match(routes, new RegExp(`route\\("${path.replace("/", "\\/")}`));
  assert.match(routes, /route\("features\/:slug\/workshop"/);
  assert.match(routes, /route\("member\/workshop\/:action"/);
});

test("admin navigation points directly to the reserved admin route", async () => {
  const navigation = await readFile("router-app/components/AccountNav.tsx", "utf8");
  assert.match(navigation, /capabilities\?\.admin[\s\S]*to="\/admin"/);
});

test("admin directory failure stays inside the admin access boundary", async () => {
  const route = await readFile("router-app/routes/admin.tsx", "utf8");
  assert.match(route, /state: "unavailable" as const/);
  assert.match(route, /admin directory is temporarily unavailable/i);
  assert.doesNotMatch(route, /throw data\("The member directory/);
});
