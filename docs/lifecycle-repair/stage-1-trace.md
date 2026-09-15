# Modular lifecycle regression — Stage 1 trace

**15 September update:** Gareth has now confirmed `/editorial.data` returns HTTP 400 because `editorial_documents.submitted_at` is missing. The unknown-boundary statements below record the earlier Stage 1 evidence, not the current diagnosis. See [Stage 2 repair and production plan](submitted-at-repair.md). No production change has been applied.

Compared deployed commit `4427f91` with prior persistence commit `0adb5c4`. Diagnostic code ran from an isolated archive at `/tmp/koma-lifecycle-4427f91`; pending Phase 5 source and SQL changes were not included or modified.

## Results

- The actual `Editorial` route component was bundled into an isolated React Router browser fixture. The modular section builder is inside the route Form.
- Clicking the actual SAVE DRAFT button reached the fixture action with `intent=save`, no initial feature ID, and all eight section types in the single `sectionsJson` field.
- The successful fixture response displayed `Draft saved.` and retained the returned feature ID. Clicking SUBMIT FOR REVIEW then sent `intent=submit` with that feature ID and all eight section types.
- The exact deployed server `action()` was invoked separately with fixture Auth/PostgREST responses. It passed authenticated/active/accepted/editorial checks, parsed all eight types, and called `save_editorial_draft` for both operations.
- RPC envelope keys remained `feature_id`, `title`, `slug`, `summary`, `category_id`, `image`, `image_alt`, `body`, `status`, `document`. Save used `draft`; submit used `submitted`. Author and publication association remain database-owned, as before.
- Both successful fixture RPC responses produced visible-success response data and a feature ID.

These are isolated form and real-action contract checks. Auth, RPC persistence and directory queries were **not** performed as a real production member. They do not prove production save/reload/shared review.

## Gaps observed, not established as the production root cause

- The same section JSON is parsed in action validation, `draftDocument`, and `documentBodyText`, rather than exactly once.
- Success uses the older `success/status` shape, not the requested `ok/message/lifecycleStatus` contract.
- The draft-loading effect depends on loader draft results; revalidation can overwrite unsaved state when reopening by query parameter. Failure preservation requires a regression test.
- The current implementation does not provide a durable idempotency contract for repeated new-panel submissions.
- Production RPC definitions and authenticated failure response have not been obtained. Repository SQL issues found during Phase 5 are not proof of this incident's cause.

## Stop condition

**Exact production failing boundary is not identified. No repair, migration, commit or deployment has been made for this incident.** No RLS changes or image-upload changes have been made. The separate Phase 5 work remains pending and is not part of this repair.

Needed evidence from the failing signed-in browser: whether SAVE DRAFT creates a POST request to `/editorial` (possibly `/editorial.data`), its HTTP status, and its response error/message. Do not share article payloads, cookies, request headers, tokens, email or keys. If no POST is sent, record the visible browser validation message or console error with private data removed.

A public URL alone does not provide the authenticated session or that response. Follow the user's stop condition: do not deploy speculative changes while the boundary is unknown.
