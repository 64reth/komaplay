import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthContext } from "../../router-app/lib/auth";
import { completionStatus } from "../../router-app/lib/auth-completion.server";
import { supabaseServer } from "../../router-app/lib/supabase.server";
import { completeAuthentication } from "../../router-app/lib/auth-callback.server";

const config = {
  url: "https://fixture.supabase.co",
  key: "fixture-public",
  authCallbackOrigin: "https://komaplay.com",
};
test("new session and delayed profile resolve without signing out or restarting OAuth", async () => {
  let session = false,
    profile: any = null,
    bootstraps = 0,
    reads = 0;
  const client = {
    auth: {
      getUser: async () =>
        session
          ? { data: { user: { id: "member" } }, error: null }
          : {
              data: { user: null },
              error: { name: "AuthSessionMissingError", status: 400 },
            },
    },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          reads++;
          return { data: profile, error: null };
        },
      };
      return q;
    },
    rpc: async (name: string) => {
      assert.equal(name, "bootstrap_member_profile");
      bootstraps++;
      if (bootstraps > 1)
        profile = {
          id: "member",
          display_name: "New member",
          role: "member",
          account_status: "active",
        };
      return { error: null };
    },
  } as unknown as SupabaseClient;
  const resolve = () =>
    resolveAuthContext({ client, headers: new Headers() }, config);
  assert.equal(
    (await completionStatus(await resolve(), "/editorial?feature=one")).state,
    "pending",
  );
  session = true;
  const delayed = await resolve();
  assert.equal(delayed.auth.state, "profile-unavailable");
  assert.equal(delayed.user?.id, "member");
  assert.equal((await completionStatus(delayed, "/profile")).state, "pending");
  const ready = await resolve();
  assert.equal(ready.auth.state, "authenticated");
  assert.equal(bootstraps, 2);
  await resolve();
  assert.equal(bootstraps, 2, "existing profile is never rewritten");
  assert.ok(reads >= 3);
});
test("transient auth failure is pending, not signed out; profile read errors retain verified user", async () => {
  for (const throwError of [true, false]) {
    const client = {
      auth: {
        getUser: async () => {
          if (throwError) throw Error("private network details");
          return {
            data: { user: null },
            error: { name: "AuthRetryableFetchError", status: 503 },
          };
        },
      },
    } as unknown as SupabaseClient;
    assert.equal(
      (await resolveAuthContext({ client, headers: new Headers() }, config))
        .auth.state,
      "resolving",
    );
  }
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "known" } }, error: null }),
    },
    from: () => {
      throw Error("private profile response");
    },
  } as unknown as SupabaseClient;
  const state = await resolveAuthContext(
    { client, headers: new Headers() },
    config,
  );
  assert.equal(state.auth.state, "profile-unavailable");
  assert.equal(state.user?.id, "known");
});
test("real SSR PKCE exchange persists all cookie chunks and survives a fresh server client", async () => {
  const previousFetch = globalThis.fetch,
    previousUrl = process.env.SUPABASE_URL,
    previousKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = config.url;
  process.env.SUPABASE_ANON_KEY = config.key;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@example.test",
    user_metadata: {
      full_name: "New member",
      picture: "https://fixture.test/" + "x".repeat(6500),
    },
  };
  const token = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "fixture",
  ].join(".");
  const headers = new Headers();
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/token") {
        assert.equal(url.searchParams.get("grant_type"), "pkce");
        return Response.json({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      }
      if (url.pathname === "/auth/v1/user") return Response.json(user);
      if (url.pathname === "/rest/v1/profiles")
        return Response.json({
          id: user.id,
          display_name: "New member",
          role: "member",
          account_status: "active",
        });
      throw Error("Unexpected fixture route");
    };
    const callback = new Request(
      "https://komaplay.com/auth/callback?code=fixture&returnTo=%2Feditorial%3Ffeature%3Done",
      {
        headers: {
          cookie:
            "sb-fixture-auth-token-code-verifier=" +
            encodeURIComponent(JSON.stringify("fixture-verifier")),
        },
      },
    );
    const context = supabaseServer(callback);
    const response = await completeAuthentication(callback, context);
    assert.equal(
      new URL(response.headers.get("location")!, "https://komaplay.com")
        .pathname,
      "/auth/complete",
    );
    const cookies = response.headers.getSetCookie();
    assert.ok(
      cookies.filter((c) => /^sb-fixture-auth-token\.\d+=/.test(c)).length >= 2,
      "new Google metadata can require several cookie chunks",
    );
    const jar = new Map<string, string>();
    for (const c of cookies) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const next = new Request("https://komaplay.com/auth/session", {
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    const resolved = await resolveAuthContext(supabaseServer(next), config);
    assert.equal(resolved.auth.state, "authenticated");
    for (const cookie of cookies.filter((c) =>
      /^sb-fixture-auth-token\.\d+=/.test(c),
    )) {
      assert.match(cookie, /Secure/);
      assert.match(cookie, /SameSite=Lax/i);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousKey;
  }
});
