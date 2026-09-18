# Canonical public panel cleanup — prepared, not deployed

Public catalogue membership now requires a document returned by the existing
`public_editorial_document` RPC. This retains its publication/access checks and
requires no new public table grants. Public feature routes require that document;
there is no synthesized article fallback. Missing configuration and query failure
produce an empty, explicitly unavailable publication rather than demo content.
The catalogue currently makes one additional RPC per eligible feature; no new
cache or alternate content store is introduced.

Removed runtime data modules: issue-zero, publication-demo, editorial, tokon-guide.
Removed static masthead links, the homepage's time link, seed-specific CSS, and
legacy VHS image remapping. FeatureItem now belongs to lib/publication.ts.
Generic missing-image artwork and existing strip sizing/scroll/resize code remain.
Discovery fixtures now live exclusively under tests/fixtures.

## Migration for review

File: supabase/migrations/202609180001_retire_legacy_seed_panels.sql

| Exact production UUID | Seed |
| --- | --- |
| ec8c0b46-fe86-48b2-afa5-ececca8598f3 | time |
| 2455f99e-3c4d-4941-9164-3e9aedbf97c7 | vice |
| 7500f1f6-e5a8-43af-a835-44001615052a | tokon |
| f479d5e1-083d-42d7-9247-63a60cda38be | afterimage |

For these four existing rows only: change status from published to archived,
lifecycle_status from open_panel to taken_down, and updated_at to transaction time.
This is retirement, not public archive publication. No rows or assets are deleted.
All other columns, contributions, revisions, citations, document snapshots and
relationships remain untouched. No canonical documents are created.

Guards verify exact UUID, slug, seed image and panel class, absence of a canonical
editorial document, published additions and citations, and expected prior state.
Any mismatch aborts the entire DO statement, including earlier updates. Missing
UUIDs are skipped (other installations have independently generated seed UUIDs).
An already retired matching row is a no-op. Table locks prevent a concurrent
editorial conversion while guards and updates run.

Read-only production inspection: target zrckabmgrbmbjbhqcngp; four seed rows have
no canonical document. Tōkon has one contribution; none has published additions
or citations. The canonical published panels test-draft and sql-test-draft are
not targeted and remain visible. No production writes performed.

## Verification

- Typecheck, full suite (145 tests), production build, git diff --check pass.
- Full migration-chain/RLS tests pass; dedicated retirement tests verify exact
  targeting, history/contribution preservation, idempotency and atomic rejection
  for changed identity/new canonical documents/new community publication.
- Browser fixture: two/one/zero panels, valid canonical links, desktop/mobile
  resizing, no page or ResizeObserver errors.
- Production inspection was read-only. This code and migration are not deployed.

Revision-image defect remains unresolved pending the failing request path,
status and response. No image-save, concurrency, auth or permission changes made.
Existing auth report/test working-tree changes are outside this cleanup.
