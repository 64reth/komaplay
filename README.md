# INK//:PLAY — Open Panel & publication alpha

A cream-paper, monochrome editorial publication built with React, TypeScript and the Next.js App Router conventions implemented by **Vinext**. Existing clue artwork and the connected horizontal feature strip are retained.

**New panels every week. New issues every month. Open Panels close when the issue ends.**

## Run locally

Requirements: Node 22.13+ and pnpm (the checked-in lockfile is authoritative).

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

The portable development server normally uses `http://127.0.0.1:5173`. If it is already running, use that server. Restart after changing environment variables. Production builds use `pnpm build`; `pnpm start` previews the generated Worker locally and does not deploy it.

With no Supabase configuration, the site presents **explicitly labelled development previews** of Issue Zero and a lightweight archive. Existing editorial text remains readable. Authentication, publishing and contribution mutations report the missing setup; they do not simulate a successful save. With configuration present but an unavailable database, the UI reports the outage instead of substituting demo database records.

Useful routes:

- `/` — current issue, newest weekly strips first, quick URL filters.
- `/features/tokon` — representative Published Panel.
- `/features/tokon/workshop` — email sign-in, structured contributions, personal submission status.
- `/archive` and `/issues/issue-01-october-2026` — permanent issues and their weekly strips.
- `/search?category=gaming&format=guide` — combined discovery filters.
- `/moderation` — role-protected contribution and private correction queues.
- `/publishing` — administrator publishing calendar and editors.
- `/features/demo-the-painted-frame/correction` — private correction example after demo seeding.
- Without Supabase, `/issues/demo-archive-august-2026` is the labelled archive preview.

## Required environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Copy the project URL and **publishable** key from your Supabase project. These are public client configuration; they do not bypass RLS. **Do not put a service-role or secret key in either variable.** This implementation does not need a service-role key. `.env.example` is tracked; `.env.local` is ignored. Public variables are also needed when building the deployed client.

The starter's optional D1 scaffold and `app/chatgpt-auth.ts` remain separate. Open Panel uses Supabase identities exclusively; a ChatGPT/Sites identity does not grant community or moderator privileges.

## Supabase setup

1. Create a Supabase project (or use a local Supabase CLI/Docker project).
2. Apply, in order, the two SQL migrations in `supabase/migrations/` using the SQL editor or `psql` as the project database owner. For a linked CLI project, `supabase db push` applies these migrations. Do not apply them repeatedly by hand.
3. Enable email authentication. Set the Auth Site URL to your local origin for development. Allow `http://127.0.0.1:5173/auth/confirm**` and the equivalent deployment origin in Auth redirect URLs. Keep the default confirmation/magic-link template using `{{ .ConfirmationURL }}`; the client starts a PKCE email flow and `/auth/confirm` exchanges the returned code.
4. Fill `.env.local` and restart the development server.
5. Sign in from a Workshop using a real email account. The first sign-in creates a profile with **member** role, regardless of any role supplied in user metadata.
6. Promote your first administrator with the database-owner procedure below.
7. Use `/publishing` to create issues/drops and `/moderation` to review contributions.

Equivalent migration commands, with `SUPABASE_DB_URL` supplied securely in your shell (not a `NEXT_PUBLIC_` variable):

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202609100001_open_panel.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202609100002_publication_lifecycle.sql
```

The first migration creates the private `open-panel-screenshots` bucket, allows PNG/JPEG/WebP, and caps objects at 5 MB. Storage and Auth services must come from Supabase; the automated embedded database tests stub only those service-owned schemas.

### First administrator

After signing in, copy your verified user UUID from **Authentication → Users**. Run this in the Supabase SQL editor as the database owner, substituting that UUID:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id = 'YOUR_VERIFIED_AUTH_USER_UUID'::uuid
returning id, display_name, role;
```

No administrator address or production user UUID is embedded in the repository. This is a one-time trusted bootstrap. Subsequently, use the administrator role form in `/moderation`: it calls a role-checked database function and records `role_audit`. An administrator cannot alter their own role through that form.

### Development seeds

**Use a disposable development project. Do not seed production.** Apply both migrations, then run the two seeds in the same explicitly opted-in SQL session:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -c "set open_panel.allow_demo_seed = 'true'" \
  -f supabase/seed.sql \
  -f supabase/seed-publication.sql
```

In the SQL editor, execute `SET open_panel.allow_demo_seed = 'true';` and the contents of both seed files together. The scripts deliberately refuse a second run. Reset a disposable database to start over.

The demo creates generated, non-login contributor identities at `example.test`, five accepted Tōkon tips/credits, a submitted strategy, an in-review correction, a changes-requested example, and revisions/audit records. These seed identities have no passwords; use your own real email account to exercise authentication.

The publication seed adds **Issue 01 / October 2026**, four editable weekly labels, published and scheduled drops, a Closing Panel, Final Panels, a draft to carry forward, manga discovery copy using existing clue artwork, a continuation link, normalized tags, and a lightweight archived pilot. The demo issue's timestamps are **relative to seed execution**, despite its October label, so open/closing examples remain testable on another day. The seed deliberately reorganises the original feature records; this is development bootstrap data, not an editorial operation supported on already-published production history.

## Open Panel architecture

- **Published Panel:** server-rendered editorial text at a stable `/features/[slug]` URL. Static original articles stay in `data/editorial.ts`; database editorial text supports newly created features.
- **Workshop:** a signed-in composer and the member's own paginated submissions. Contribution types and target sections are structured, and ordinary submissions never become a public comment feed.
- **Contribution:** private proposal with optional protected screenshot, HTTPS source and allowlisted YouTube/Twitch link. Members may resubmit or withdraw only Submitted/Changes Requested material **while its Panel is open**.
- **Published addition:** separate curated record created by acceptance. Public credits derive from these records, not raw submissions. More than four credits use a native accessible disclosure.
- **Revision:** each acceptance increments the feature revision and records a public change summary and contributor IDs.
- **Audit:** append-only moderation events preserve earlier decisions. Withdrawals are retained internally with a timestamp, not destructive deletion.

Browser and server clients live in `lib/supabase/`. Server API handlers verify users with `auth.getUser()`, load the authoritative profile role and use the caller's session for all database operations. No browser-supplied role is trusted. The `/api/open-panel/session` handler refreshes cookies while validating the active Workshop session; client auth events and returning to the tab recheck it. Expired or invalid sessions prompt another sign-in. Browser sign-out clears the Supabase session.

`moderate_contribution` atomically locks the proposal, creates its curated addition, increments the feature revision, appends revision/audit records and updates moderation status. Failed or duplicate decisions roll back. Accepted/rejected contributions are final; accepted content cannot be silently edited through a member endpoint. Media uses ordinary safe outbound links, not arbitrary embed HTML. Public text is React-escaped plain text.

## Publication hierarchy and lifecycle

`issues → weekly_drops → features`, with stable feature slugs independent of assignment. Categories, formats and topic tags are normalized tables, with a feature/tag junction. Optional relationships express `continues_from` and `related`; reverse links display “Continued in”.

- Issues: `draft → current → finalising → archived`. A partial unique index enforces at most one `current` issue; number and year/month are unique.
- Drops: `draft → scheduled → published`. Publication is intentional, either immediate or through reconciliation of a due schedule.
- Features: `draft → open_panel → closing_panel → final_panel → archived`.
- The effective deadline is `deadline_override ?? issue.closes_at`. All database timestamps are `timestamptz` / UTC. Admin form fields explicitly use UTC.
- The last seven days default to Closing Panel; an issue can configure a different closing period.
- At the exact deadline, the database rejects new contributions, member edits and withdrawals. Public display derives its state from the same timestamps even before reconciliation runs.
- Draft features and unpublished/scheduled strips are never automatically closed as if they had been published. Administrators can carry draft features into another issue/drop.
- Moderators may finish existing reviews during `finalising`; members cannot respond after closure. Resolve remaining requests through moderator editing/acceptance or rejection rather than reopening a Workshop.
- Archive requires elapsed deadlines, no unpublished/draft features left behind, and no unresolved contributions. Normal issues require four or five published drops; legacy Issue Zero is exempt. Archive freezes the issue and features. Later developments belong in follow-up features, not rewrites of archived articles.

### Publishing a month

1. In `/publishing`, create an issue with its stable identity, theme and UTC window. Create four or five weekly drops using the editable labels.
2. Finish/finalise the prior current issue, then mark the new draft issue current. The database will reject a second current issue.
3. Create or select a feature. Assign its issue/drop, category, format, tags, text and existing clue artwork. Set the panel position with the number field or **Move up / Move down**, then save.
4. Publish features intentionally. A feature in a draft/scheduled drop stays private until the drop itself is published. Use the role-protected preview links to inspect the feature or issue/strip before publication.
5. Publish a drop immediately or schedule its UTC timestamp inside the issue window. Save its display order to reorder drops. The homepage shows newer drops first; the permanent issue page reconstructs their publication sequence.
6. Before the deadline, apply any exceptional feature deadline override. Final or archived Panels cannot be reopened or rewritten. Move an **unpublished** feature by selecting its new issue and matching drop and saving; its slug remains unchanged.
7. After closure, reconcile, finish moderation, carry drafts forward, then archive. Contributors and revisions remain public and searchable.

### Reconciliation / future cron

There is no configured scheduled job in this repository. Deadline security does **not** depend on one.

The administrator button calls `POST /api/publication/reconcile`, which is authenticated, same-origin, role-checked and idempotent. It publishes due scheduled drops only in still-open current issues, transitions expired current issues to finalising, and marks eligible published features closing/final. A due schedule after its issue deadline remains unpublished for intentional rescheduling/carry-over.

A future cron provider can invoke the same **database RPC** using a securely stored, validated administrator session access token and the public publishable key; `reconcile_publication` still checks the database role. Manage token renewal in that server-only integration. Alternatively, arrange a trusted database-owner scheduler to perform equivalent reconciliation. No cron secret, service-role browser key, external scheduler or new hosting platform is introduced here.

## Archive, discovery and corrections

Current-issue quick filters and global discovery use query parameters, so navigation and sharing preserve the selected view. Search supports title/editorial text/topics, category, format, issue, topic and open/closed state. Archive filters additionally include contributors. Issue shelves show counts, identity and finalisation date; selecting an issue reconstructs its separate weekly strips.

Closed features offer **Report a Correction**, not an open discussion. A verified signed-in account can privately report factual errors, attribution, broken sources, safety, or rights concerns. The database serializes requests per reporter and limits them to **three per hour**. Only that reporter and moderators/admins can read a report or its audit. `/moderation` includes the private report queue and decision notes. Resolving a report records the decision; it does not silently rewrite the archived article. A later editorial follow-up can be linked to the original.

## Security and permissions

| Role                 | Permissions                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Visitor              | Read published issues/features/additions/credits; search; browse archive.                             |
| Member / contributor | Verified email account; active Workshop proposals; own submission status; private correction reports. |
| Moderator            | Review proposals, edit/accept, request changes/reject, process corrections, preview drafts.           |
| Administrator        | Moderator permissions plus issues/drops/feature organisation/deadlines/archive/taxonomies/roles.      |

RLS covers every community/publication table. Only safe public profile fields are exposed in `public_profiles`. Direct browser table writes are revoked; narrowly scoped `SECURITY DEFINER` functions use an empty search path and verify identity/role, ownership, lifecycle and input constraints. The pre-lifecycle helper functions are explicitly non-executable to API roles, preventing a deadline bypass. Public feature/addition visibility also requires a published drop and issue. The same user-scoped Storage policies protect screenshot reads and uploads; overwrite/delete is deliberately disallowed to preserve submitted/published evidence.

## Community handbook

Apply `202609100003_community_handbook.sql` after the Open Panel and publication migrations. It seeds the source-controlled active handbook, records versioned acceptance with timestamp and compact statement version, and requires current acceptance for Workshop, correction, moderation, publishing and screenshot actions. Public reading remains available without a session at `/handbook`.

Members who need to accept or re-accept an updated handbook are sent to `/onboarding`. The four-panel guide preserves internal return paths and requires an unchecked, explicit Compact checkbox. Administrators can inspect prepared versions and activation counts at `/handbook/manage`; versions are prepared in migrations, never edited in the browser.

Privileged server routes recheck roles independently of UI gating. Mutation routes reject cross-origin requests. Supabase functions enforce the same permissions for direct RPC callers. Neither cookies containing invented profile roles nor `raw_user_meta_data.role` elevate an account.

## Verification

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

There was no project formatter or test harness. This alpha adds Prettier and Node's test runner via `tsx`. The SQL tests use PGlite (embedded Postgres), with minimal Auth/Storage schema stubs, and execute the actual migrations/functions/RLS. Tests cover authentication gating, credit collapsing, input validation, role escalation, atomic publication, deadline boundaries, closure/finalisation/archive rules, correction privacy/rate limiting, ordering/filtering, idempotent reconciliation, carry-over, and development seeds.

Live acceptance checklist after Supabase setup:

1. Open a feature signed out; verify readable server HTML, metadata and credits. Disable JavaScript to verify public text remains present.
2. Sign in with email, submit a tip and a valid screenshot; test source/media validation. Edit and withdraw an eligible personal proposal.
3. As a member, attempt `/moderation`, `/publishing` and their mutation endpoints; confirm denial.
4. As a moderator, edit and accept a proposal; reload its public article and verify the addition, credit, revision and audit. Request changes and reject separate examples.
5. As administrator, create an issue/drop, assign a draft, preview, reorder, schedule/publish and reconcile. Confirm only one current issue.
6. Move a deadline into the past in a disposable issue. Confirm stale browser forms cannot save. Finish reviews, carry remaining drafts, archive, and verify correction privacy.
7. Verify desktop wheel/trackpad/drag/keyboard scrolling and mobile touch swipes within each strip; reduced motion and no overall horizontal overflow.

## Alpha boundaries

No CMS, OAuth providers, user-created topics, nested comments, chat, likes, reputation, subscriptions, direct video upload, realtime updates or recommendations algorithm. No production credentials, migrations applied to a remote database, email sent, deployment, commit or push are part of this implementation. Live Auth/Storage integration must be verified against your configured project. Orphaned private uploads can be cleaned by a future trusted maintenance job; clients cannot delete historical evidence. Search currently loads the public catalogue for deterministic server filtering; a dedicated paginated full-text search service can be introduced as the archive grows.

See [the architecture notes](docs/open-panel.md) for file boundaries and trust layers.

Implementation references: [Supabase cookie-based SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [passwordless email authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless), [database function security](https://supabase.com/docs/guides/database/functions), and [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control).
