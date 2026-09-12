import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthDialog } from "../../router-app/components/AccountNav";
import {
  authCallbackUrl,
  requestAuthOrigin,
  trustedAuthOrigin,
} from "../../router-app/lib/auth-origin";
import { safeReturnPath } from "../../router-app/lib/handbook";
import { authReturnPath, withQuery } from "../../router-app/lib/auth";
import { resolvePublicSupabaseConfig } from "../../router-app/lib/supabase-config";

const render = (mode: "sign-in" | "create", initialError = "") =>
  renderToStaticMarkup(
    <AuthDialog
      initialMode={mode}
      returnTo="/features/tokon/workshop"
      config={null}
      initialError={initialError}
      onClose={() => undefined}
    />,
  );

test("the shared account dialog has explicit sign-in and account-creation modes", () => {
  const signIn = render("sign-in");
  assert.match(signIn, />SIGN IN</);
  assert.match(signIn, /type="email"/);
  assert.doesNotMatch(signIn, /Display name/);

  const create = render("create");
  assert.match(create, /CREATE ACCOUNT/);
  assert.match(create, /Display name/);
  assert.match(create, /name="consent"/);
  assert.match(create, /required=""/);
});

test("auth callback origins are selected from explicit deployed and local origins", () => {
  assert.equal(
    authCallbackUrl(
      requestAuthOrigin(
        new Request("https://komaplay-canary.garetha81.workers.dev/"),
      ),
      "/features/tokon/workshop",
    ),
    "https://komaplay-canary.garetha81.workers.dev/auth/callback?returnTo=%2Ffeatures%2Ftokon%2Fworkshop",
  );
  assert.equal(
    authCallbackUrl(requestAuthOrigin(new Request("https://komaplay.com/")), "/"),
    "https://komaplay.com/auth/callback?returnTo=%2F",
  );
  assert.equal(
    authCallbackUrl(
      requestAuthOrigin(new Request("http://localhost:5173/search?q=tokon")),
      "/search?q=tokon",
    ),
    "http://localhost:5173/auth/callback?returnTo=%2Fsearch%3Fq%3Dtokon",
  );
  assert.equal(trustedAuthOrigin("https://evil.test"), "https://komaplay.com");
  assert.equal(
    authCallbackUrl("https://evil.test", "https://evil.test/workshop"),
    "https://komaplay.com/auth/callback?returnTo=%2F",
  );
});

test("public Supabase config accepts legacy and Worker-safe names only", () => {
  assert.deepEqual(
    resolvePublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
    { url: "https://example.supabase.co", key: "anon-key" },
  );
  assert.deepEqual(
    resolvePublicSupabaseConfig({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-read",
    }),
    { url: "https://example.supabase.co", key: "anon-key" },
  );
  assert.equal(
    resolvePublicSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-read",
    }),
    null,
  );
});

test("callback failures are understandable and retain a safe internal destination", () => {
  assert.match(
    render("sign-in", "This sign-in link is invalid or expired."),
    /role="alert"/,
  );
  assert.equal(
    authReturnPath(
      new Request(
        "https://komaplay.com/auth/callback?returnTo=%2Ffeatures%2Ftokon%2Fworkshop",
      ),
    ),
    "/features/tokon/workshop",
  );
  assert.equal(
    authReturnPath(
      new Request(
        "https://komaplay.com/auth/callback?returnTo=https://evil.test",
      ),
    ),
    "/",
  );
  assert.equal(
    withQuery("/search?q=panel", "auth_error", "expired"),
    "/search?q=panel&auth_error=expired",
  );
});

test("return paths reject origins, encoded path confusion and internal APIs", () => {
  for (const unsafe of [
    "//evil.test/profile",
    "https://evil.test/profile",
    "/api/open-panel/session",
    "/auth/callback",
    "/features/tokon%2Fworkshop",
    "/features/tokon\\workshop",
  ])
    assert.equal(safeReturnPath(unsafe), "/", unsafe);
});

test("initial browser session hydration does not trigger a loader revalidation loop", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("router-app/components/AccountNav.tsx", "utf8");
  assert.match(source, /event === "INITIAL_SESSION"/);
  assert.match(source, /event === "TOKEN_REFRESHED"/);
  assert.match(source, /return;/);
});
