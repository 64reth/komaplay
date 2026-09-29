# Anonymous attribution boundary — investigation and remediation

Status: remediation approved for coordinated production cutover. See `phase1-production-cutover.md` for the staged deployment sequence.

## Trace completed before remediation

- `contributions.author_id` is the authoritative private relationship. Own-member and actual moderator/admin reads are RLS protected; editorial review RPCs explicitly check authority.
- `published_additions` was publicly selectable in full. It materialises `contributor_id`, `publishing_moderator`, private `contribution_id`, and `screenshot_path` containing the uploader's account UUID. `publication.server.ts` selected these fields into public feature loader data. React hiding a name did not protect serialized responses.
- `revisions.contributor_ids` was publicly selectable and serialized into revision history. This joins different submissions by the same account, irrespective of their per-submission attribution choice.
- `public_profiles` exposed account IDs and derived credit from account defaults, not the published contribution's selected credit. A named submission or opted-in public profile could identify an anonymous addition through the same account UUID.
- `panel_citations.contribution_id` joined back to additions. Citation display snapshots could also disagree with Pen name selection (existing publication RPC used display name for every non-anonymous choice).
- `storage.objects` screenshot SELECT allowed public metadata for published additions. Object names begin with account UUID; owner/owner_id also provide a join. `/api/open-panel/image?path=...` redirected to signed Storage URLs containing that private path. Listing, signing, redirects and route serialization all require protection.
- Equivalent asset exposure exists in editorial feature URLs/documents and selected cover storage metadata. `public_editorial_document`, raw public `features.image/editorial_body`, and `issues.cover_art` can contain uploader paths. Raw issues also expose `created_by` and `cover_updated_by`. Public storage metadata must be separated from image bytes, including covers, without exposing non-selected Cover Pool assets.
- Public catalogue/filter IDs, React keys, credit lists, image src, revision arrays and loader JSON all depend on the above public query contract. Private Workshop, editorial and moderation consumers must retain their own authorised original records.
- Other public lookup tables (categories, formats, tags, drops, relationships) contain publication IDs, not account IDs. Their visibility joins must continue to work when raw issues/features are restricted. Handbook version metadata and all executable public functions need explicit regression inventory.

## Read-only production inventory, 29 September 2026

0 public additions; 0 anonymously credited public additions; 0 public contribution screenshots; 1 public revision. A second aggregate query found 0 additions in total, 0 anonymous contributions, and 0 revision rows containing account-ID arrays. One public issue had internal actor metadata. No destructive historical transformation is indicated. These counts describe currently public records, not proof that identifiers were never exposed previously.

## Public contract

Public contribution objects have a publication-object ID, intentional content, a credit display string and an explicit anonymous state. Anonymous objects have no account ID, shared contributor token, original contribution ID, private asset path, owner metadata or moderation actor ID. A named credit may have a random public credit identity independent of the account primary key. Account preferences never override an individual anonymous credit.

Public revisions expose editorial revision metadata and intentionally published credit displays, not account arrays. Public media uses an opaque per-publication reference and streamed image bytes, without redirects or upstream metadata headers. Public storage listing/signing of private original objects is denied. Public data projections enforce publication/takedown and archive-only selected-cover rules; private provenance remains intact.

## Rollout constraints

Use additive projections and references; retain original rows and files. Tighten access only alongside corresponding public query changes. No historical records or original assets are deleted or rewritten. The image gateway requires a server-only media credential; missing configuration must fail closed. Do not place this key in VITE/NEXT_PUBLIC variables, route data, browser code, logs or git.

Before an eventual authorised rollout, run migration/RLS checks and authenticated media smoke. The old Worker cannot be left running against tightened raw-table policies: coordinate a maintenance window or staged interface cutover. A rollback must preserve hardened policies; rolling back to publicly selectable originals is not an acceptable privacy rollback. Existing signed URLs may remain usable until expiry; previously downloaded identifiers cannot be recalled.

## Implemented boundary

- Migration `202609290002_public_attribution_boundary.sql` adds `public_features`, `public_issues`, `public_additions`, `public_revisions`, `public_citations` and `public_credit_profiles`. Migration `202609290003_private_provenance_cutover.sql` restricts originals and replaces the legacy `public_profiles` contract. Fixed, no-argument definer functions serve these projections. Transformation helpers and private media maps cannot be called/read by public users, avoiding guessed-path lookup oracles.
- Named credit is a per-publication snapshot (Display name or Pen name) with an opaque publication-credit ID. Anonymous credits have no contributor token. The old account-default/public-profile linkage is removed. The now-unconsumed profile-public checkbox is deferred; its stored value is preserved. Existing default-credit settings still initialise future contributions.
- Original additions, revisions and citations remain available under owner/staff RLS; contributor records, review RPCs and editorial documents retain internal account linkage. The public helper cannot widen editorial/review permissions. Published citations refer to public addition IDs, not private contribution IDs.
- Private storage SELECT/signing is denied to anonymous users. Authenticated original-image previews remain permission checked. Legacy public path endpoints return 404. Public document JSON and catalogue rows use context-scoped media references. The resolver requires both a live publication context and an approved public image slot; a pasted private path is not publication authority.
- The Worker image endpoint does not redirect or forward storage headers/errors. It strips EXIF/XMP/descriptive image metadata and returns only validated image bytes with no-store headers. Tokens stop resolving after takedown/removal. Non-selected and unarchived Cover Pool artwork cannot resolve.
- Public issue projections omit creator/cover-editor account IDs. Anonymous handbook SELECT uses a separate policy and excludes its internal publisher column. Other public taxonomies/relationships carry publication IDs only. Boolean visibility RPCs do not return account identities; private RPCs retain their existing execution/role checks.

## Historical handling and limits

Backfill adds private media references and credit snapshots; it does not delete, rename or move original files or rewrite provenance. For any legacy Pen name row without a historic pseudonym snapshot, a backfill would use the current pen name; production currently has no additions requiring this fallback. Internal original citations are retained.

This protects system-generated identity links, including reused assets. It cannot undo already downloaded responses, revoke a previously issued signed URL before expiry, or prevent someone deliberately identifying themselves in editorial prose, external sources or image pixels. No production evidence of an anonymously published contribution was found in the aggregate checks.

## Credential and original remediation state

No migration, credential change, commit/push or Worker deployment was performed during the original remediation. The subsequent cutover is now explicitly authorised. Provision `SUPABASE_MEDIA_SERVICE_KEY` only through the server environment before a separately authorised rollout. It is a privileged Supabase backend credential, used only by the `.server` gateway; the public configuration resolver does not accept or expose it. Missing configuration returns 404 rather than falling back to public storage access. Local gateway transport tests use dependency injection; an authenticated real-storage smoke remains required before rollout.

## Validation

Full migration-chain SQL tests cover per-submission anonymity after incorporation, named/pen attribution, same-account mixed anonymous/named submissions, asset reuse, private helper/RPC denial, public storage denial, raw-table restrictions, own-work and staff provenance, independent review, anonymous handbook reads, selected-cover archival, takedown and unapproved image references. Image gateway tests cover byte/metadata handling, no redirects, non-disclosing errors and secret configuration isolation.

`scripts/smoke-public-attribution.mjs` consumes public JSON produced by those SQL tests and checks the actual public components at 390px/1440px: named/anonymous labels, revision history, serialized data, DOM and browser image URLs. The image response transport is a fixture; it is not a production smoke test.

Final local checks: 207/207 tests passed; typecheck, lint, production build and `git diff --check` passed. Both public-attribution and Workshop-recovery browser scripts passed at 390px and 1440px. The built client output contains no media credential name, private resolver or media-reference table code. Production checks in this task were aggregate read-only queries only; no migration was applied and no deployment was attempted.
