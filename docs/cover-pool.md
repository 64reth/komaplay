# Private Cover Pool

Implemented on production commit `e3895cf6aa8f00a02cfbc173a4884805390f541e`, including Cover Editor `23a09108aa9b1b77effab2d2207afd9e80f657d6` and image upload hardening `e5d72b63d4e35c1a3118eb6bab66285ecd9953c8`.

The Cover Editor links to `/cover-editor/pool`. Create a candidate there, edit it in the existing Cover Editor and save a private draft. Submit it from the pool. Each creator has two candidate slots per issue, including drafts and withdrawn entries. Withdrawn entries cannot be resubmitted; this deliberately prevents submission churn. Submitted entries are immutable.

Active Moderators and Admins retain the existing `save_issue_cover` compilation authority. Members, Contributors (including editorial grants), suspended accounts and signed-out visitors have no committee access. Contributor expansion needs an explicit compilation capability in both the route and SQL policy. Handbook acceptance is required for routes and mutations. Drafts and withdrawn candidates are visible only to the creator and Admins. Submitted, selected and non-selected entries are visible to the committee. Creator UUIDs provide a private fallback identity; no public creator directory is added.

Each committee user has one vote per issue, changeable until selection. A Moderator or Admin must tick the explicit replacement confirmation to choose a candidate with the highest vote count (ties can be resolved by choosing either). Selection copies the candidate cover data into the existing issue fields, reruns archive validation and records the prior artwork and selection in the private cover audit. Selection closes all changes and voting. Selected entries cannot be deleted. The existing Cover Editor cannot overwrite a selected pool cover. The pool offers the existing current-issue archive action after selection.

## Privacy boundary

`202609280001_private_cover_pool.sql` adds candidates/votes with RLS, revokes direct writes, and exposes only an authenticated, role-checked mutation RPC. Every mutation locks the issue row, so concurrent creates, votes and selections serialize. No candidates, vote totals or creator records are added to public catalogue queries.

Candidate uploads use the private `issue-cover-pool` bucket, with random paths that do not encode creator IDs. Uploaded artwork cannot be reused by another candidate. No UPDATE or DELETE storage policies are granted. The committee image route checks current auth on every request and proxies private bytes with `private, no-store`; it does not issue committee image URLs that can be shared. Ordinary editorial uploads remain separate. Candidate artwork must be uploaded through the private candidate editor; existing public panel artwork cannot be directly attached as a candidate asset.

The only public storage policy permits the exact artwork of the selected candidate when its issue is archived. Unselected, withdrawn, draft and orphaned assets have no public policy. The public image endpoint uses that policy; it cannot read candidates or votes. Selection clears the issue's public `cover_updated_by` field; actor and creator identities remain in private records. The selected artwork credit is intentionally part of the official public cover metadata.

## Deployment and verification

Apply the additive Supabase migration before deploying the app. Never deploy the app first: the committee routes depend on the new RPC and private bucket. Existing official covers are preserved. No existing candidates or votes need backfilling. Migration rollback is not required to roll back the app: the old Cover Editor writer remains callable, with protection against overwriting a pool selection.

Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `node scripts/smoke-cover-pool.mjs`, and `git diff --check`. Database tests execute actual PostgreSQL migrations and RLS under anonymous/authenticated roles. The browser smoke uses real UI components with fixture transport at 390px and 1440px, covering two submissions, vote/change vote, explicit selection confirmation and closed voting. It does not claim a live Supabase end-to-end run. Live authenticated smoke and migration application require the project's database management credentials.

Anonymous HTTP smoke: run the production preview on port 4179, then `node scripts/smoke-cover-access.mjs`. `COVER_SMOKE_ORIGIN` can override the origin. This checks actual document, route-data, upload and image responses, including private/no-store headers on error pages.
