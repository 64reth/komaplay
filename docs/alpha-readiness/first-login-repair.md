# First Google sign-in reliability repair

## Diagnosis and evidence

Owner production smoke: new Google member in incognito returned to sign-in on attempt one, succeeded on attempt two; existing accounts and repeat sign-in succeeded.

Reproduced KOMA failure path: `resolveAuth` treated every initial `getUser` error as a settled signed-out result; `AccountNav` ignored `INITIAL_SESSION`, including a valid session that arrived after that server snapshot. Missing profiles produced `profile-unavailable`, but member loaders could translate that into sign-in gates and there was no bootstrap recovery. Successful callback exchange redirected immediately into those loaders, with no completion barrier. The root loader could also perform a separate auth lookup while the callback was exchanging the code.

Production read-only evidence: both recent users currently have profiles; the synchronous `open_panel_profile` trigger is enabled. That does **not** establish that a delayed profile caused the original incident. The original attempt had no stage telemetry, so its exact first failing network/lookup response cannot be reconstructed. The stale signed-out race and absent recovery are reproducible defects; a Google provider failure or lost cookie is not proven.

The real Supabase SSR client regression exchanges a fixture code, generates a multi-chunk session (large Google-style metadata), forwards every Set-Cookie header and authenticates a fresh server client. It passes. Cookie adapter reads now also see writes made earlier in that same request.

## Repair

- Successful code exchange redirects to `/auth/complete?returnTo=…`, preserving all session cookies.
- Callback/completion root loads skip competing auth resolution. The completion page has no sign-in controls or route prefetch; it shows **Completing your sign-in…** immediately.
- Same-origin, no-store POST `/auth/session` verifies the user server-side, resolves/bootstrap-checks the profile, and checks Pocket Guide acceptance. No tokens or private profile data are returned.
- Transient Auth failures become `resolving`, not signed-out. A delayed/erroring profile retains the established user/session. Global recovery replaces sign-in gates while resolution is pending.
- The browser's asynchronous initial session can recover a stale signed-out snapshot. It only requests authoritative resolution; browser session data is not used to grant access.
- `bootstrap_member_profile()` inserts only the caller's missing profile, deriving a display name from Auth metadata. It cannot set roles/preferences or overwrite an existing profile. No user-id argument; anonymous execution denied. Existing profile trigger unchanged.
- Bounded automatic polling leads to an explicit retry button on transient failure. Retry checks the existing session; it does not initiate another OAuth request.
- Required Pocket Guide acceptance routes to onboarding with the original safe return path. Existing members return directly. Restrictions remain enforced.
- Safe diagnostics log callback exchange outcome and completion state only, without application logging of codes/tokens, email, user metadata or content.

Reference: Supabase's [SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) recommends a dedicated post-sign-in destination before entering routes that depend on session cookies. This implementation uses the existing PKCE/cookie system, not a replacement provider integration.

## Validation

- `pnpm typecheck`, **139 tests**, `pnpm build`, `git diff --check`: passed before release.
- Regression: asynchronous session → delayed profile → successful bootstrap; transient Auth/profile errors; existing profile never overwritten; real SSR chunked cookies survive a new request.
- Full migration-chain test includes missing-profile bootstrap, repeated bootstrap preserving chosen identity/default member role, and anonymous denial.
- Browser: completion state persists through delayed readiness; new member reaches Pocket Guide with retained panel destination; bounded failure shows retry; retry finishes without Google; existing member returns directly.
- Existing Google dialog/initiation browser regression remains passing.
- Only `202609150003_member_profile_bootstrap.sql` pending in production dry-run. No seeds, roles, vault or provider configuration changes.

## Gareth's production acceptance

1. Use a genuinely new Google account in a fresh incognito window. Open a Workshop or other intended destination, choose Google **once**.
2. Expect “Completing your sign-in…” after callback, then Pocket Guide acceptance. No intervening signed-out/sign-in page. Accept and confirm the original destination.
3. Confirm one profile with member permissions, then sign out/repeat sign-in. Existing account should return directly when the current guide was already accepted.
4. Cancel Google once and confirm existing cancellation recovery still works.
5. If completion cannot finish, use **TRY AGAIN**. It must retry `/auth/session`, not send you back through OAuth. Report only the visible result, HTTP status and approximate time; never share cookies/tokens or code URLs.

Automated fixtures do not replace real Google consent testing. The exact original failed attempt cannot be retrospectively proven from absent telemetry; new safe stage diagnostics allow a recurrence to be distinguished from provider rejection.

Rollback baseline: Worker `2bd9011c-1a6f-4d33-91ec-830af974f89c`. The additive bootstrap function can remain when rolling back application code.

## Production release

- Application commit: `8806da74c1788dc1afb86ad0f36ec646661525aa`, pushed to `origin/fix/editorial-submit-feedback`.
- Worker `komaplay`: `e43002c0-f084-4196-9223-b22d4e7fcd33`.
- Applied only `202609150003_member_profile_bootstrap.sql`. Verified migration record, authenticated execution, anonymous denial and `ON CONFLICT DO NOTHING`. No existing profiles changed by migration.
- Production browser: 15 routes and 14 additional links passed; invalid/cancelled callback recovery and live Google PKCE initiation passed.
- Production completion page: SSR waiting state, bounded retry, no Google restart, no-store pending response and foreign-origin rejection passed. No browser errors; no production account created by tests.
- Google provider credentials/dashboard settings unchanged; Worker variables preserved.

Rollback command:

```sh
pnpm exec wrangler rollback 2bd9011c-1a6f-4d33-91ec-830af974f89c --name komaplay
```

The new function is additive; do not remove profiles or reverse the migration as part of a Worker rollback.

## 18 September recovery status

The later accidental Vinext deployment was rolled back to Worker
`2bd9011c-1a6f-4d33-91ec-830af974f89c`. The first-login repair remains in
commit `8806da7` and is included unchanged in the reconciled Alpha candidate,
but is not active in the restored production Worker pending release approval.
