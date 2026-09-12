# KOMA://PLAY framework migration baseline

Recorded 2026-09-12 before replacing Vinext. This inventory describes production commit `9d4eae8d64d6dd137967405916ec84966358f951` and Worker `komaplay` version `84ff85d7-3ae3-4f25-ad56-f89878b8d0e6` at `https://komaplay.com`.

## Recovery boundary

- Production source: branch `main`, commit `9d4eae8d64d6dd137967405916ec84966358f951`.
- Production Worker: `komaplay`; do not modify it during migration.
- Previous known Worker version: `152ee932-4e48-48f0-9f36-c241c2c55c3e`.
- Rollback: inspect `pnpm exec wrangler versions list --name komaplay`, then deploy the recorded version with Wrangler's version rollback command. Production rollback is reserved for a separately approved production cutover.
- Migration branch: `migration/react-router-cloudflare`.
- Visual baselines: 375×812, 768×1024, and 1440×900 for `/` and `/features/tokon` under `docs/migration/baseline/`.
- Known production failure: direct routes return HTTP 200, but Vinext client-side navigation from the FeatureStrip can remain on `/`. This is a rejected baseline behavior.

## Environment contract

Names only; values remain in ignored local or Cloudflare configuration.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_ACCESS_TOKEN` (deployment tooling only)
- `SUPABASE_DB_URL` (migration tooling only)
- `CLOUDFLARE_CF_FETCH_ENABLED` (local runtime control)

The React Router application will rename browser-facing variables only in a later compatibility phase. Phase 1 does not connect authentication or private data.

## Route and interaction inventory

| Route | Visibility | Primary interactions | Data/services |
| --- | --- | --- | --- |
| `/` | Public | masthead, issue/category/filter links, search, FeatureStrip arrows/drag/keyboard/cards, archive | issues, weekly_drops, features, taxonomy, published additions/public profiles |
| `/issues/:slug` | Public | issue navigation, filters, strips/cards, archive | publication catalogue |
| `/features/:slug` | Public | issue navigation, article media/gallery/citations, Workshop/correction CTAs | features, published_additions, revisions, panel_citations, public_profiles |
| `/archive` | Public | filters, issue/feature links | issues, features, taxonomy |
| `/search` | Public | query input, filters, result links | publication catalogue |
| `/handbook` | Public | publication return, four-panel guide entry | handbook_versions; local protected fallback |
| `/onboarding` | Public/member | sign-in/create account; required four-panel flow; accepted return | auth session, profiles, handbook_versions, handbook_acceptances, `has_current_handbook_acceptance`, `accept_handbook` |
| `/features/:slug/workshop` | Member | auth boundary, section/proposal forms, evidence, return | profiles, features, contributions, screenshots bucket; contribution RPCs |
| `/features/:slug/correction` | Public/member | correction form and return | correction_reports, `submit_correction` |
| `/profile` | Member | account menu, contributions, settings/editorial/moderation links | profiles, contributions, panel_citations, editorial_access_grants |
| `/profile/settings` | Member | save preferences, profile/publication return | profiles; profile settings resource route |
| `/editorial` | Editor/admin | compose/preview/structure, module/media controls, autosave/recovery, review links | editorial_documents, snapshots, media_assets, access_grants |
| `/moderation` | Moderator/admin | queue filters, decision forms, protected evidence | contributions, moderation_audit, public_profiles; moderation RPCs |
| `/publishing` | Admin | issue/drop/feature scheduling and reconciliation | publication tables, correction tables; publication RPCs |
| `/handbook/manage` | Admin | create/activate handbook versions | handbook_versions, audit/acceptance counts; handbook RPCs |

## Authentication and capability states

- Signed out: public routes only; Workshop and account routes show sign-in boundaries.
- Session resolving: neutral state; protected data remains unloaded.
- Active, handbook required: mandatory Pocket Guide; publication is inert and blurred.
- Active, accepted: member routes and feature-scoped Workshop are available.
- Restricted/suspended: Workshop/profile capability remains blocked without private moderation detail.
- Editor grant: active, unexpired/revoked grant or administrator role.
- Moderator/administrator: server role plus active account; RLS remains authoritative.

## Database and storage dependencies

Tables: `profiles`, `issues`, `weekly_drops`, `features`, `categories`, `content_formats`, `tags`, `feature_tags`, `feature_relationships`, `contributions`, `published_additions`, `revisions`, `panel_citations`, `moderation_audit`, `role_audit`, `correction_reports`, `correction_audit`, `handbook_versions`, `handbook_acceptances`, `handbook_version_audit`, `handbook_acceptance_compatibilities`, `editorial_access_grants`, `editorial_documents`, `editorial_document_snapshots`, and `editorial_media_assets`.

RPCs include `has_current_handbook_acceptance`, `accept_handbook`, `handbook_acceptance_counts`, `activate_handbook_version`, `feature_accepts_contributions`, `save_contribution`, `withdraw_contribution`, `moderate_contribution`, `grant_open_panel_role`, `submit_correction`, `review_correction`, `reconcile_publication`, and `manage_publication`.

Private storage bucket: `open-panel-screenshots`.

## Test baseline

- Unit/component/database: 33 tests passing at the production source boundary.
- Playwright: Chromium projects at 375×812, 768×1024, and 1440×900.
- Local signed-out navigation passed before deployment.
- Production signed-out navigation failed when clicking the actual FeatureStrip card; the URL remained `/` in all three projects.
- Production failure artifacts are generated locally and are not source-controlled.

