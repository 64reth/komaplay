# Save Revision concurrency repair — local candidate

Confirmed production request:
- featureId: 466ba82e-5193-4b41-9e97-0482d9aa0338
- currentStatus: changes_requested
- expectedUpdatedAt: 2026-09-16T13:53:01.257846+00:00

Production document updated_at at diagnosis: 2026-09-19 13:13:08.048833+00.
Snapshot history identifies a successful draft save at that time; the preceding
review return was at the submitted baseline timestamp. There is no timestamp
precision conversion in the editor/action path. Loader reads, local editing and
image preparation do not write editorial_documents. The review transition and
successful save each update its timestamp and revision token.

The actual editor/React Router reproduction establishes a lost-baseline path:
a submit saves successfully, then returns HTTP 400 for unmet requirements. Loader
revalidation is skipped; the response effect reads the old loader timestamp.
The next save submits that old timestamp. Two HTTP-success saves do not reproduce
this problem. Production request/history confirm the old baseline and intervening
save; the earlier HTTP response itself was not captured in the supplied evidence.

## Fix

Add save_editorial_draft_versioned(jsonb), a security-invoker wrapper around the
existing save_editorial_draft. Within the same transaction and held row lock it
returns feature_id and updated_at. It retains all existing author, lifecycle,
concurrency and RLS checks; anonymous access is revoked. No data backfill, table
change, existing function replacement or unconditional update is introduced.

Action responses carry the own-save receipt, including saved-but-not-submitted
400/403 and downstream failure responses. A failed save has no receipt. The editor
adopts only its own receipt, never a possibly newer loader snapshot. Existing
unsaved content and ordering remain in editor state; genuine conflicts retain
both edits and baseline. Opening a saved revision explicitly loads its paired
canonical document/version. The existing copy-before-reopen guidance and dirty
navigation warning remain; no automatic overwrite or conflict rebase is added.

## Verification

146 tests passed, including full SQL migration/RLS tests and a named returned-
revision regression covering alt text, ordinary text, reopen, repeated receipts,
resubmission and stale editor rejection preserving newer work. Real route-action
coverage asserts exact receipt propagation on a saved HTTP 400 response.
Browser regression uses actual Editorial and React Router with simulated transport:
successive saves, saved-but-400/403 then save, and genuine conflict preserving input.
Wrapper privileges are asserted: security invoker, anonymous execution denied,
authenticated execution granted.
Typecheck, production build and git diff --check passed.

## Release sequence (not executed)

1. Review/commit this focused candidate.
2. Verify only 202609190001_editorial_save_version.sql is pending, then apply it.
3. Verify wrapper permissions and unchanged existing concurrency function.
4. Deploy the committed React Router candidate using deploy:production.
5. Authenticated owner: reopen latest returned panel, edit alt text, save twice,
   reopen and confirm persistence, then resubmit. Test two stale sessions too.

The wrapper is backward-compatible with the current Worker; apply before the new
Worker calls it. No production change, migration application or deployment was
performed during this repair. Canonical cleanup, seed retirement, OAuth and
publication rules are untouched.
