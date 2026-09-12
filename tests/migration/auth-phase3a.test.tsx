import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthDialog } from "../../router-app/components/AccountNav";
import { safeReturnPath } from "../../router-app/lib/handbook";
import { authReturnPath, withQuery } from "../../router-app/lib/auth";

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
