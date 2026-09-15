# Stage 2 — editorial submission timestamp repair

Prepared 15 September 2026. **Proposed only: no production database change, commit or Worker deployment performed in Stage 2.**

## Established failure

Gareth reproduced SAVE DRAFT at `https://komaplay.com`: `/editorial.data` returns HTTP 400, `column "submitted_at" of relation "editorial_documents" does not exist`.

The server action calls `save_editorial_draft(jsonb)`. Its INSERT references the missing column even for a draft whose timestamp value would be NULL. This is a database schema/function mismatch, not evidence that the modular form failed to submit. Applying committed migrations in local PostgreSQL reproduces the exact error through the real route action.

## Reference inventory and repository evidence

| Location | Meaning |
| --- | --- |
| `supabase/migrations/202609110006_editorial_dashboard.sql` | Creates `editorial_documents` without `submitted_at`. |
| `supabase/migrations/202609130006_editorial_placeholder_asset_path.sql:46–48` | First committed editorial reference, in `save_editorial_draft`. Introduced by `782578f01d95ed46c0b684890c4bf7de289e4e07`, before modular builder `4427f91`. INSERT uses `now()` for submitted, NULL otherwise; UPDATE preserves existing time with `coalesce` for submission and retains it for other saves. |
| `supabase/migrations/202609130002_canonical_editorial_lifecycle.sql` | `submit_editorial_draft(uuid)` changes lifecycle without setting this timestamp. Repeated submission returns early. This second path needs consistent timestamp handling. |
| `supabase/migrations/202609140002_public_alpha_hardening.sql:5,62–64` | Pending, uncommitted broad Phase 5 migration adds the column and replaces the save RPC. Excluded from this repair. |
| `supabase/migrations/202609150001_editorial_submission_timestamp.sql` | Proposed narrow column/trigger repair. |
| `tests/migration/editorial-timestamp.test.ts` | New regression assertions for the missing column and lifecycle timestamps. |
| `supabase/migrations/202609110004_community_edition_workshop.sql:7,14,35` | Separate `panel_citations.submitted_at`, required `timestamptz`; unrelated to editorial drafts. |
| `router-app/lib/open-panel.ts:153`, legacy `lib/open-panel/domain.ts:155` | Citation timestamp type, `string`; unrelated. |
| `router-app/lib/publication.server.ts:188` | Selects the citation timestamp. |
| `router-app/components/open-panel/PublishedPanel.tsx:174`, legacy `components/open-panel/PublishedPanel.tsx:170` | Displays the citation timestamp. |
| `tests/migration/public-components.test.ts:173` | Citation fixture. |

No committed migration adds the editorial column. Therefore this is not a known committed migration merely awaiting application. The pending broad migration is unsuitable for an isolated incident repair. Production migration history and installed RPC definitions still require read-only comparison before application.

Searches of active and legacy code, migrations, tests, scripts, database definitions and generated files found no generated TypeScript editorial timestamp field. Worker environment and React Router generated types do not describe this table. No database-type regeneration is required for this addition. `editorial_my_work` and `editorial_review_inbox` do not return the timestamp.

## Proposed migration and semantics

Apply only `supabase/migrations/202609150001_editorial_submission_timestamp.sql`.

- Adds nullable `submitted_at timestamptz`, with **no default and no backfill**. The NULL branch in the committed save RPC requires nullability; its `now()` expression and existing pending DDL support the timestamp type. A default would incorrectly timestamp drafts.
- Adds one BEFORE trigger covering INSERT and updates to lifecycle/timestamp. New drafts retain NULL. First transition into `submitted` receives transaction time; creation directly as submitted also receives it.
- Preserves the first known submission time across repeated submissions, changes requested, draft edits and resubmission, matching the existing RPC's `coalesce` intent.
- Legacy rows remain NULL when their historical submission time is unknown. A later actual transition into submitted records a time if none was known. Merely saving an already-submitted historical row does not fabricate a time.
- Both submission RPC paths use the same rule. A later failure within the RPC rolls the timestamp and lifecycle back together.
- Does not replace save/review RPCs, alter RLS, rewrite documents or change the canonical payload or feature ID. Trigger function has no direct execution grant to client roles.

The migration runs in a transaction. `IF NOT EXISTS` makes an already-present column tolerable, but does not repair an incompatible definition: preflight must confirm its type/nullability/default if present.

## Regression evidence

`tests/migration/editorial-timestamp.test.ts` invokes the real Editorial action and real committed SQL RPCs using PGlite. Auth and PostgREST HTTP transport are fixtures; this is not an authenticated production smoke test.

Coverage includes exact pre-repair HTTP 400; repaired Save Draft; all eight modular types; reopened section order and quote attribution; reordered save and submit with retained `featureId`; repeated saves without duplicate work; image-alt rejection without mutation; composer Submit Draft; saved-row Submit Draft; immediate submission; timestamp preservation on retries/revision; other-editor review visibility and member exclusion; late SQL failure rollback. A repeated new creation with the same slug returns an error and leaves one panel; this does not claim a new durable idempotency contract.

Verification passed:

| Scope | Typecheck | Tests | Build |
| --- | --- | --- | --- |
| Isolated deployed `4427f91` plus only this migration/test | Pass | 115 passed | Pass |
| Current working tree, including separate pending Phase 5 work | Pass | 119 passed | Pass |

`git diff --check` also passed. Isolation matters: the broader pending migration is deliberately excluded from the incident regression's database setup.

## Production plan — await review before execution

1. Confirm the target Supabase project and available database backup/recovery point. Read migration history, the column definition and installed definitions of `save_editorial_draft(jsonb)` / `submit_editorial_draft(uuid)`; compare with the tested repository versions. Stop on unexpected drift. Capture existing trigger definitions, if any.
2. Prepare a focused commit containing only this migration, regression test and incident documentation. Leave unrelated pending Phase 5 source/SQL out.
3. Apply **only this SQL file**, transactionally, through the approved database migration connection. For example, with the production connection supplied securely in the environment: `psql "$KOMA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202609150001_editorial_submission_timestamp.sql`. Record migration version `202609150001` in migration history through the normal migration tooling after confirming success. Do not run an unrestricted `supabase db push`: the pending broad migration must not be swept in.
4. Verify `information_schema.columns`: timestamp with time zone, nullable YES, default NULL. Verify `editorial_submitted_at` trigger exists and points to `set_editorial_submitted_at`. Confirm existing documents remain present; do not backfill or delete history.
5. In Gareth's authenticated production browser, create one clearly labelled test panel with all eight section types. Save; confirm visible success and retained panel ID. Reload/reopen; confirm exact order. Reorder and save; reload again. Submit; confirm the same ID and visible submitted status. Check the test row's lifecycle/timestamp only: NULL before submission, non-NULL afterwards. An independently authorised editor must see it in Review Inbox; an ordinary member must not.
6. Continue the requested review/request-changes/resubmit/approve/publish smoke only after save/submit succeeds. Confirm published section order. Record the test panel's final disposition without deleting history.

**No Worker deployment is required for this database-only repair.** The deployed action already calls the correct RPC. Leave Worker `komaplay`, its variables and the previously recorded version `af6dc916-c0ad-4b3d-849d-9029b522b4ec` unchanged. Any later application deployment needs separate review and validation; that version has not been freshly verified in this stage.

## Recovery and remaining risks

If migration execution fails before COMMIT, roll back the transaction. If a trigger-specific problem appears after application, a reviewed recovery can drop only `editorial_submitted_at` and `public.set_editorial_submitted_at()`, retaining the column and recorded values. That restores prior RPC timestamp behaviour, including its missing timestamp on submit-existing. Do **not** drop the column: doing so recreates the confirmed Save Draft outage. Worker rollback does not repair missing database columns.

Live RPC/schema preflight, production application and authenticated production smoke remain outstanding by request. This narrow repair does not complete the separate Phase 5 launch-readiness audit or resolve the other observations in Stage 1. No launch-ready claim is made.
