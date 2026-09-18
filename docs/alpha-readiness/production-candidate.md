# Reconciled Alpha production candidate — 18 September 2026

Production remains at Worker 2bd9011c-1a6f-4d33-91ec-830af974f89c (source ed482a7).
No migration or Worker deployment is authorised during candidate preparation.

## Source of truth

Use branch `fix/editorial-submit-feedback` in `/tmp/koma-submit-repair`.
Its base is 8806da74c1788dc1afb86ad0f36ec646661525aa, including the tested first
Google login repair and all preceding Alpha hardening. Cleanup was integrated
by reviewing/committing its existing working-tree diff, not copying another tree.
The additional auth regression test and historical release report are included.

`main` at afa55f8 is the obsolete Vinext application; it shares ancestor 9d4eae8
with the Alpha branch. Its last commit added only a document and image. A build
compiles the whole checkout, not only the commit diff. Its generated Wrangler
redirect targets dist/server/wrangler.json, which deploys Vinext to komaplay.
The older migration/react-router-cloudflare worktree at cc3fbc8 and its pending
changes are excluded. Do not merge either checkout over this candidate.

## Verified candidate

- Typecheck, 145 tests (including full migration-chain/RLS and guarded retirement),
  production build, diff whitespace checks passed.
- Browser fixtures passed: canonical two/one/zero panels and desktop/mobile resize;
  desktop/mobile submission focus/order/preservation; desktop/mobile Google UI;
  delayed first-session/profile resolution and bounded retry without OAuth restart.
- Full Google consent and authenticated production publishing remain owner smoke.
- Public smoke discovers actual panel URLs via sitemap instead of requiring Tōkon.
- Retirement migration details: canonical-panel-cleanup.md. No data is deleted.
- Read-only migration preview found only 202609180001_retire_legacy_seed_panels.sql.

## Commands after separate approval

First confirm checkout/commit and the production project again. Existing authenticated
CLI (no global installation or credential changes required):

```sh
cd /tmp/koma-submit-repair
/Users/garethwallen/.npm/_npx/b96a6bd565c470ce/node_modules/.bin/supabase db push --linked --project-ref zrckabmgrbmbjbhqcngp --skip-vault --dry-run
```

Stop if anything other than the reviewed retirement migration is pending. After
approval and successful identity/dependency preflight, the application command is:

```sh
/Users/garethwallen/.npm/_npx/b96a6bd565c470ce/node_modules/.bin/supabase db push --linked --project-ref zrckabmgrbmbjbhqcngp --skip-vault --yes
```

Production deployment, only after separate approval:

```sh
pnpm --dir /tmp/koma-submit-repair run deploy:production
```

The script roots itself in its own checkout, rejects a non-Alpha package and dirty
source, builds using React Router, validates the generated config and invokes:

```sh
pnpm exec wrangler deploy --config react-router-build/server/wrangler.json --name komaplay --keep-vars --message "<full commit SHA> React Router Alpha"
```

The explicit config avoids .wrangler/deploy redirects to Vinext. The package script
cannot invoke the old build path. It cannot prevent someone independently running
obsolete commands in the old main checkout: never deploy from that checkout.
Use
`node scripts/deploy-production.mjs --check` for a non-deploying source check.

Excluded: seed application, Worker deployment, auth/dashboard configuration edits,
Vinext changes, old worktree pending hardening, unrelated main document/image,
and any speculative revision-image fix (still awaiting the failed request).
