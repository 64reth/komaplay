# Phase 1 production cutover

Approved targets: Supabase `zrckabmgrbmbjbhqcngp`, Worker `komaplay`, domain `komaplay.com`. Branch `feat/trust-continuity`, based on live Cover Pool commit `775fd2882b7b51acc488af126bd56a49b8f5a9f5`. No Phase 2 or canonical keyring artwork changes.

## Sequence

1. Validate full migration chain, application tests, types, lint, build and browser recovery/privacy checks. Validate the rollback-only production SQL against the same local chain.
2. Commit and push the reviewed scope. Stage that exact built Worker with `wrangler versions upload --name komaplay --keep-vars`. Provision `SUPABASE_MEDIA_SERVICE_KEY` using a temporary mode-0600 secrets file populated from secure CLI capture; remove it in a finally block. Never print credential values.
3. Apply `202609290001_trust_continuity` and additive `202609290002_public_attribution_boundary` using a temporary migration directory containing all history through A. Verify migration history and new safe interfaces before activating the Worker. A preserves old Worker interfaces.
4. Activate the staged Worker and immediately apply `202609290003_private_provenance_cutover` (B). B closes raw table/storage access and replaces legacy public profile/document interfaces. Do not leave the old Worker running against B.
5. Verify migrations current; execute `scripts/phase1-production-checks.sql`, which rolls back all synthetic records. Verify anonymous REST/HTTP/media and member browser flow, with scoped cleanup of temporary private fixtures.

## Security contract

New public contribution attribution uses `credit_id`/`credit_ids`, never account-linked contributor fields. Anonymous credits have no identity token. Named credits are per-publication snapshots. Public media references are opaque and context scoped; approved slots and live visibility are rechecked. Original provenance/assets remain intact under authorised access.

The server media secret is never included in public configuration, route data or browser assets. Verify binding existence only. A missing secret or invalid/unapproved media reference fails closed.

## Failure policy

After B, fix forward or keep affected media/surfaces unavailable. Never restore anonymous raw records, original storage paths/metadata or account-linked public projections. Do not deploy the old Worker as an availability rollback.

## Validation evidence

The full application suite previously passed 207 tests. The additional production SQL rehearsal adds a test for the actual rollback-only check. Browser suites pass at 390px and 1440px for recovery, conflicting writes, retry/idempotency UI, anonymous/named attribution, serialized data, DOM and opaque image requests. These browser suites use fixture transport; production results must be reported separately. Final deployment identifiers and production outcomes are recorded after execution, not assumed from local checks.
