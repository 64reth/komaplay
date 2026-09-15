# Submission feedback repair — 15 September 2026

## Evidence and scope

Production project `zrckabmgrbmbjbhqcngp` has the timestamp repair. Read-only inspection found the most recently edited panel still in `draft`, with `submitted_at = NULL`. Its fifth body section is an image with a valid source but empty alt text. All other textual sections were nonempty. No article text was retrieved for diagnosis.

Both Submit paths validate body sections before invoking SQL. The composer sends `intent=submit` to `/editorial.data`, then `save_editorial_draft(status=submitted)`. The saved-row button sends `intent=submit-existing`, reloads the canonical document, validates it, then invokes `submit_editorial_draft(featureId)`. Missing image alt causes HTTP 400 before either mutation. Thus the draft correctly remains outside Review Inbox.

Production `editorial_review_inbox` already joins author profiles with LEFT JOIN and uses a fallback display name; it selects submitted/changes-requested/approved documents for authorised editors without author filtering. No inbox SQL rewrite is justified by this evidence. The older submitted production row predates the timestamp migration, explaining its historical NULL timestamp.

The exact failing browser response was requested but has not been supplied at preparation time. The missing-alt blocker is established for the latest saved panel and reproduced through the actual action/RPC regression; attribution to the user's exact click remains to be confirmed.

## Repair

- `router-app/routes/editorial.tsx`: show section requirements beside submission controls; on any failed action, focus and scroll to the existing error summary, including failures from saved-row actions below a long article.
- `tests/migration/editorial-timestamp.test.ts`: reproduce saving a missing-alt image and failing saved-row submission without lifecycle/timestamp change; correct, save and submit the same ID; verify all eight ordered types in another editor's inbox, including a fixture-only legacy blank author display name. Existing timestamp retry/revision/rollback tests remain.
- `scripts/smoke-editorial-submit.mjs`: real route browser test verifies focused error feedback and corrected submission preserving eight sections and panel ID. Transport is simulated; separate action/SQL tests cover persistence.

No article content, permissions, lifecycle RPCs, schema or Worker configuration changed. No production backfill. The isolated branch starts at `cc3fbc8`; unrelated pending Phase 5 files are excluded.

## Verification and deployment

Passed `pnpm typecheck`, `pnpm test` (115), `pnpm build`, `git diff --check`, `node scripts/smoke-editorial-submit.mjs`, and `wrangler deploy --name komaplay --keep-vars --dry-run`.

Deployment target: Worker `komaplay`, account `203bf3287fc4eb1260ec344a3e0f5071`. Preserve dashboard variables using `--keep-vars`, confirmed against installed Wrangler 4.127.0 help and the [Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/). Previous production version, verified before rollout: `af6dc916-c0ad-4b3d-849d-9029b522b4ec`. Rollback if necessary: `pnpm exec wrangler rollback af6dc916-c0ad-4b3d-849d-9029b522b4ec --name komaplay`. Database timestamp repair remains in place during Worker rollback.

## Gareth's authenticated smoke

1. Reload Editorial and reopen the affected panel. Confirm the same ID and section order.
2. With image section 5 alt empty, click Submit for Review. Expect the focused error `Image section 5 needs alt text.`; panel remains draft and timestamp remains NULL.
3. Add a meaningful description of that image in its **body section alt field** (the hero alt field is separate). Save Draft; reopen and confirm alt, section order and ID persisted.
4. Submit for Review. Expect visible success, submitted status and the same ID in the shared Review Inbox. Confirm as a second authorised reviewer and confirm first-submission timestamp is populated.
5. Request changes, revise/save and resubmit. Confirm the original submission timestamp and section order are preserved.

If a different error occurs, record `/editorial.data` status/message without tokens or article payload. The browser/SQL fixtures do not replace this authenticated production proof.
