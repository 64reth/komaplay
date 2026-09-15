# Deployment record — 15 September 2026

- Final application commit: `ed482a74bea31f3f7f64e97abdad35acfc8ba839`.
- Main hardening/migration commit: `0f9a6cf6d668d2e07c85840859950488cf95a3e8`.
- Branch: `fix/editorial-submit-feedback`, pushed to `origin`.
- Worker: `komaplay`.
- Final Worker version: `2bd9011c-1a6f-4d33-91ec-830af974f89c`.
- Initial hardening deployment: `ec4ac2f7-8c59-49ea-9aed-2568f1493821`.
- Previous production version: `f049bd19-c9f2-468c-8a27-2dcc39511240`.
- Production project: KOMA PLAY (`zrckabmgrbmbjbhqcngp`).
- Applied only `202609150002_alpha_access_and_limits.sql`; no seeds, custom roles or vault updates. Post-apply dry-run reports up to date and no pending migrations.
- Verified: seven new guards/inventory triggers; limits and retry tables; profile display-name update permitted while role/account-status update denied; `submitted_at` remains nullable `timestamp with time zone`, default NULL.
- No Worker environment values or Google credentials/dashboard configuration overwritten. `--keep-vars` used.

## Verification result

- `pnpm typecheck`: passed.
- `pnpm test`: **135 passed, 0 failed**.
- `pnpm build`: passed.
- `git diff --check`: passed.
- Worker deployment dry-run and staged credential/private-key pattern scan: passed.
- Actual editor browser regressions: desktop and mobile Google dialog/failed-auth/retry; desktop and mobile submission requirements/focus/order; upload re-encoding → persistence → public strip image/alt/link.
- Complete migration-chain test: direct permissions and quotas, retries, profile creation/settings, incomplete draft, first-save deduplication, stale write, eight-section review/revision/publication/takedown, private/public storage access and original submission timestamp.
- Final production browser: **15 routes and 14 additional internal links passed**, expected 404, invalid callback, Google visibility/cancel recovery, preserved editorial destination; no uncaught browser errors.
- Live Google button initiated `provider=google` with `code_challenge_method=s256`, production `/auth/callback`, and the original `/editorial?feature=…` destination. No account consent or account creation was performed.
- Production HTML: sitemap, robots, private noindex and article metadata/JSON-LD passed.
- Existing Google provider: live initiation returned HTTP 302 to Google. Existing Site URL and allowlist cover the application callback. No production configuration mismatch found requiring owner action.

Browser fixtures simulate provider/storage transport where credentials or real account consent are required. They do not claim that authenticated Google consent or end-to-end production publishing has been performed. Follow the authenticated checklist in [README](README.md#gareths-authenticated-production-smoke), starting with Save Draft, reopen and Submit for Review.

## Release decision

Technical hardening is deployed. Wider public launch remains conditional on authenticated owner smoke, approved public contact/terms/retention/age policy, backup recovery verification, and optional abuse-provider configuration. The two public test-panel candidates remain untouched pending content review. Turnstile is implemented but not enabled by this release.

Rollback the Worker if necessary:

```sh
pnpm exec wrangler rollback f049bd19-c9f2-468c-8a27-2dcc39511240 --name komaplay
```

This restores the previous application; it does not reverse the additive migration or delete history. Do not run improvised rollback SQL.
