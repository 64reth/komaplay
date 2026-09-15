# Alpha completion audit — 15 September 2026

Scope: the existing React Router application and `komaplay` Worker, isolated from the older Vinext checkout and unrelated pending changes. Baseline commit: `8e20b6b0a079fae6e9520f992783732acbfddfd6`. Production Supabase: KOMA PLAY, `zrckabmgrbmbjbhqcngp`. No provider credentials are changed.

## Evidence and disposition

| Area | Before this pass | Result / evidence |
|---|---|---|
| Modular editor, stable sections, retained panel ID, permissive drafts, actionable validation | Verified complete | Existing shared Zod contract, real route/SQL tests and browser submission fixture retained. Eight types, reordering, deletion and correction remain covered. |
| Submission, universal inbox, revision, approval, publication, archive, timestamps | Present but incomplete | Existing transactional RPCs reused. Save RPC now rejects lifecycle escalation and changes to submitted/published work; optional timestamp comparison rejects stale saves. Full migration test covers eight-section submission/revision/publication/takedown and first-submission timestamp. |
| Public/private document and image access | Present but incomplete | Public image policy previously queried a private table as anonymous; new access-decision function covers hero and ordered section images, and excludes takedowns. Private draft read is author-only. Public profiles respect visibility/credit preferences. |
| Feature Strip pipeline | Present but incomplete | Existing publisher appends approved panels to the strip. Existing editor configures title, standfirst, hero and alt; no second feature model. Upload now re-encodes/resizes browser images, checks server dimensions and reuses content-derived paths on retry. Private inventory tracks new uploads. Replacement/removal changes the document reference; retained objects are not deleted. Missing/broken image fallback retained. |
| Google authentication | Present but incomplete | Existing Supabase provider and PKCE callback reused; Google button added to both modes. Return allowlist now includes editorial panel/review identities. Callback has safe cancelled/expired/unavailable outcomes. Google display name used for new profiles; existing names untouched. Sign-out failures are visible. |
| Production auth destinations | Verified complete | Read-only config dry-run: Site URL `https://komaplay.com`; `https://komaplay.com/**` covers `/auth/callback?returnTo=…`. Live Google initiation returned 302 to `accounts.google.com/o/oauth2/v2/auth`. No dashboard mismatch requiring an owner change was found for production. |
| Profile settings | Present but incomplete | Missing UPDATE grants repaired only for editable preference columns; role/account status remain protected. |
| Messaging and navigation | Present but incomplete | Account menu now links to Editorial and Review Inbox. Moderation masks technical errors, load failures no longer masquerade as empty lists, quota/stale-save messages explain recovery. Existing submission focus/error associations retained. |
| Layered abuse protection | Present but incomplete | Configurable atomic hourly/daily account quotas run inside DB triggers for editorial actions, submissions, contributions, profile edits, reports and both upload buckets, including direct requests. Suspended accounts fail membership checks. Moderator account controls preserve an audit trail. Supabase remains responsible for authentication verification/provider limits; accounts are not identity-verified people. |
| Turnstile | Blocked by external configuration | Optional editorial submission widget and authoritative Siteverify are implemented and tested, inactive until all environment settings exist. Does not gate Google sign-in. It supplements DB limits; it does not secure direct Supabase RPCs by itself. Authentication CAPTCHA / provider limits remain Supabase configuration, not silently overwritten. |
| SEO | Present but incomplete | Canonical public routes retained; public sitemap/robots added, private HTML noindex, Open Graph/Twitter metadata and article JSON-LD added. No private drafts in sitemap. Legacy-domain redirect needs domain/zone verification before changing routing. |
| Privacy, terms and safeguarding | Blocked by owner/legal decision | Public factual Alpha notice now explains actual auth/storage/cookies/credits/moderation and unresolved matters. Final terms/licence, retention schedule, public contact, age/safeguarding and legal approval are not invented. These block an unrestricted public launch, not deployment of technical fixes. |
| Design system | Verified complete with small repairs | Existing paper/ink/accent/focus/danger tokens, editorial geometry, buttons, dialogs and renderer reused. No redesign. Browser desktop/mobile checks required below. |
| Operations | Present but incomplete | Runbook below records configuration, permissions, migration/rollback, media inventory and manual recovery. No destructive cleanup or content deletion. Backup recovery has not been proven; requires owner action. |
| Excluded platform features | Deferred beyond Alpha | No payments, advertising, marketplace, messaging/feed, native apps, recommendations, streaming, unrestricted layouts or gamification. |

## Remaining risks / launch decisions

- Actual new/existing Google-account consent, email delivery and production authenticated lifecycle tests need the owner’s browser; fixture tests are explicitly labelled and do not prove real-account consent.
- New editor sessions send a private creation key: retrying the first save reuses its canonical panel. Existing saves retain feature ID and duplicate submission RPCs are idempotent. Refresh/navigation warns about unsaved changes; it does not promise recovery after a browser crash.
- Optimistic timestamp is sent by this editor. Older/direct clients can omit it for compatibility; ownership, lifecycle restrictions and quotas still apply.
- Database submission guard is a defensive minimum for direct RPC clients. Detailed contributor guidance remains the single shared client/server TypeScript contract. Advanced legacy modules continue to require editorial review.
- Storage quota/type rules also cover direct uploads; browser optimisation and server byte/dimension validation apply to the application upload route. A direct Storage client can bypass re-encoding. Such assets remain private until editorial review/publication.
- Upload inventory is reviewable, not an automatic garbage collector. Inventory added here covers new uploads. Retain previous assets for snapshots; do not delete historical objects during Alpha cleanup.
- Per-account limits reduce flooding after registration. Disposable-email detection and invasive fingerprinting are deliberately not used: email/Google authentication cannot establish real-world identity. Existing unauthenticated auth limits remain managed by Supabase; production-wide scrape protection remains Cloudflare configuration.
- Older clients without creation keys or optimistic timestamps retain compatibility but cannot gain those stronger retry/conflict guarantees.
- Production test-content candidates: `/features/test-draft` (Test 03) and `/features/sql-test-draft` (sql tes 004), both open panels. Owner should choose retain/archive/takedown through moderation after inspecting them. No deletion of test content, legacy files, submissions or audit history was performed.

## Configuration and deployment

Public Worker Supabase settings use the existing resolver (`SUPABASE_URL` plus anon/publishable key or supported legacy names). A service-role key is never passed to the browser. Preserve Worker vars using `--keep-vars`. Google provider credentials and redirect settings are unchanged. Use local `http://localhost:5173`; its existing allowlist entry is present.

Optional Turnstile: create/use a managed widget for **komaplay.com**, action `editorial-submit`. Set public `TURNSTILE_SITE_KEY`, secret `TURNSTILE_SECRET` through Cloudflare’s secret interface, and `TURNSTILE_HOSTNAMES=komaplay.com`. Do not include localhost in production. Configure all together; partial configuration fails closed for submission while allowing draft saves. Test a fresh token, replay, expiry, outage, keyboard operation and retry before enabling for users. No credentials belong in chat or source control. Google auth is intentionally unchanged by this switch.

Migration `202609150002_alpha_access_and_limits.sql` is additive to tables/history and replaces bounded functions/policies. It retains RPC signatures and accepts old save clients. It adds account counters/configuration/audit, upload inventory trigger, access fixes and defensive submission guard. It does not backfill or delete content. Test against the full committed migration chain; compare remote migration history before applying **only this file**. Stop on mismatch or error. Deployment record is maintained separately after execution.

## Permissions and data model

`features` is the canonical panel; `editorial_documents.feature_id` holds ordered working JSON and lifecycle/timestamps; immutable snapshots retain revisions. Published/archived documents are served via the public RPC. `issues` and `weekly_drops` determine publication placement. Storage stays private; signed URLs are short-lived and require current access decisions.

| Actor | Permitted work |
|---|---|
| Signed-out reader | Published/archived reading; no drafts, Workshop mutations or review |
| Active member after Pocket Guide | Own profile preferences and Workshop contributions/reports |
| Granted editor | Own private drafts; submit; shared non-draft editorial inbox |
| Authorised reviewer/publisher | Review and existing role-granted publishing/archive/takedown actions |
| Moderator/admin | Account restriction/restoration with reason/audit; cannot change own account or an admin here |
| Restricted/suspended account | Public reading; member mutations denied |

Quotas live in `abuse_action_limits`, not scattered UI constants. Counters are bounded to one row per actor/action and reset logically as windows elapse. Successful mutations and counters commit atomically; failed mutations roll back. They are not a log of rejected attempts. Do not expose numerical thresholds in contributor messages.

## Operations / recovery

1. Start from the deployed branch/worktree and confirm clean status/project identity. Run typecheck, full tests, production build and diff check once after final edits.
2. Read-only migration preflight, then apply the named transaction and verify definitions/history. Do not use an unreviewed broad migration from another checkout.
3. Deploy built Worker using `pnpm exec wrangler deploy --name komaplay --keep-vars --message '<commit / purpose>'`. Record version and smoke results.
4. Worker rollback: `pnpm exec wrangler rollback f049bd19-c9f2-468c-8a27-2dcc39511240 --name komaplay`. This is the known pre-pass version; new migration remains backward compatible for ordinary saves. Rollback does not reverse DB policies or restore data. Do not improvise reverse SQL.
5. Review `editorial_media_assets` staged paths against feature hero, module references and snapshots before considering cleanup. Never delete storage rows directly; use Storage API only after explicit retention/deletion approval.
6. Confirm backup availability and rehearse restore in a separate project before wider launch. Earlier production inspection reported no listed physical backup/PITR; this pass does not claim recoverability or change the subscription.
7. Keep real user content out of logs and bug reports. Record route, status, timestamp, correlation/deployment ID and safe outcome only. Operational logs are enabled; investigate 5xx and repeated failed submissions using those details.
8. `komaplay.co.uk`: verify ownership/Cloudflare zone, then add a single permanent 301/308 redirect preserving path/query to `https://komaplay.com`; test HTTP/HTTPS and avoid forwarding credentials. No DNS/zone change made without confirming the source zone.

## Gareth’s authenticated production smoke

1. Signed out: open a public panel and its Workshop. Choose Google; cancel once and check the retry message. Retry with an existing account and confirm the original Workshop destination.
2. Sign out, repeat sign-in. Use a new Google member: profile exists, role remains member, Pocket Guide is required, accepting it returns to the original route. A plain member must not enter Editorial or Review Inbox.
3. As an editor, open `/editorial`; create all eight section types. Save incomplete draft, confirm “Draft saved,” reopen My Panels, verify order, IDs/content and image reference. Submit incomplete work: all requirements listed/focused; correct then submit and check Submitted badge/inbox.
4. Upload PNG/JPEG/WebP, confirm preview/alt, save/reopen; retry same image, replace and remove it. Submit/approve/publish with the final image; signed-out Feature Strip and public article must show the saved image and canonical link.
5. Reviewer requests changes; author revises/resubmits. Verify original submitted_at remains unchanged. Editor cannot publish. Publisher approves/publishes; public order/credits match review. Archive/takedown through intended controls and verify public availability changes.
6. Two tabs on one private draft: save tab A, then save tab B. B must report a newer version and retain its edits for copying. Reopen current version before retrying.
7. Workshop contribution → review/correction/publish; profile preferences save/reopen. Test a controlled restricted account and restore it, checking audit record. Do not stress production with an automated flood; quota boundary/retry are covered locally.
8. Check mobile editor, keyboard controls, visible error focus and image fallback. Check sitemap contains only public panels and private HTML carries noindex.
9. Before broader invitations: approve final policies, public contact/age guidance, retention/backup plan and abuse-provider configuration. These are launch requirements, not reasons to silently alter working Google settings.
