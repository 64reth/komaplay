# Access levels and monthly Issue rollover

The Admin selector presents Member, Editorial Contributor, Moderator and Admin. `set_member_access_level` serialises and atomically applies the existing site role and editorial grants. Member removes grants; Editorial Contributor uses the real editor grant and removes legacy reviewer authority. Moderator/Admin retain explicit editorial grants while receiving their actual site role. Self-changes are rejected; all elevated selections require confirmation. Content and grant history remain intact.

The previous deployment had no Cron Trigger or scheduled Worker handler. The existing admin-only `reconcile_publication` only finalised expired Issues; manual `close_current_issue` selected its target using publication-month heuristics. The scheduler deliberately uses exact Issue membership, with no date-based Panel reassignment.

Production deployment configures a Cloudflare Cron Trigger every 15 minutes. Canary has no trigger and is disabled. The handler calls the service-only `run_issue_rollover` RPC using the existing server-only Supabase service credential. There is no public HTTP trigger. SQL uses the database clock and explicit UTC calendar boundaries, with an advisory lock plus Issue row locks.

A due current Issue enters finalising. Cover Editor displays private operational status. Confirm the **saved official cover and lead** to enable archival; editing the cover or Issue dates invalidates confirmation. Missing decisions produce `needs_editorial`, not fabricated selections. Pause holds an Issue; explicit Issue/Panel deadline extensions are respected. Empty months and draft Issues are untouched. A new Issue must be intentionally created/started through the existing publication workflow; automation does not invent one.

Archival changes only already-public Panels in that Issue, preserves taken-down/draft material, uses existing archive validation/audit and anonymous public projections, and leaves unpublished drops untouched. Only the selected Cover Pool artwork can pass rollover. Every Issue is a subtransaction: a failure rolls back its partial changes, records `error`, and retries on the next run. Repeated successful invocations do not duplicate snapshots or archive audit events.

For operational verification, invoke the same `run_issue_rollover` RPC with authorised service credentials, or inspect scheduled Worker logs (`monthly-issue-rollover`) and the private Cover Editor state. Never patch Issue/archive status manually. The rollback-only `scripts/access-rollover-production-checks.sql` verifies real permissions, RLS and publication safety. Full-chain tests also inject an archive failure locally and verify atomic retry.

Initial production audit: Issue 00's deadline was 2026-10-01 00:00 UTC; its saved drawing-desk cover lacked a lead Panel and no Cover Pool candidate was selected. The user confirmed that saved artwork, with the lead decision pending. No lead or cover is inferred by automation.

Cloudflare trigger reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/


## Two-gate correction — 4 October 2026

Migration `202610040001_two_gate_issue_rollover.sql` supersedes the original rollover gates described above. Automatic archive requires only the end of the Issue’s UTC calendar month and a valid submitted Cover Pool cover. A lead Panel, deadline extension, pause flag, or separate rollover confirmation is not an archival gate. Saved artwork and drafts do not count as submissions. A sole eligible submission is selected automatically; an existing valid selection is preserved. Multiple submissions use the existing vote totals: a unique leader resolves automatically and a tie reports `AWAITING COVER SELECTION`. Zero valid submissions reports `AWAITING COVER`. The service RPC remains private, locks exact Issue identity, rolls back failures per Issue, and creates no Issues.

Targeted validation: `node --import tsx --test tests/migration/two-gate-rollover.test.ts tests/migration/issue-rollover.test.ts`. Worker code and canonical badge assets are unchanged.

## Canonical close operation — 4 October 2026

`202610040002_canonical_issue_close.sql` replaces the divergent legacy date-guessing close path. Manual actions send the exact preview/selected Issue ID to `close_issue(uuid)`; both that authorised wrapper and the service-only scheduler call `close_issue_internal(uuid)`. Issue advisory/row locks, an atomic archive subtransaction, and structured outcomes support double-clicks, races, failure retries and already-complete results. Published membership is recorded in the private archive audit and cannot receive late publications. No Issues are created by closure.

Cover Editor and Admin read backend closure state. Known blockers/errors are displayed directly; a lost transport response is followed by a state read before showing uncertainty. The old no-ID RPC no longer guesses an Issue. Previously saved artwork has a separate explicit, confirmed submission RPC; it retains the original author and artwork. Legacy archives can reconcile that same artwork without reopening or duplicating snapshots.

The original manual route swallowed RPC errors into “No confirmation was received” and neither sent an Issue ID nor inspected the returned archive state. A rollback-only replay of the old RPC succeeded after removal of the old lead guard. During this investigation Issue 00 acquired a separate archive audit at 12:42:43 UTC while still having zero Pool submissions, confirming the legacy bypass. This is distinct from the canonical reconciliation below; the historical failed request's provider error must not be inferred from a successful later replay.

Targeted checks: `two-gate-rollover.test.ts`, `issue-rollover.test.ts`, `issue-close-feedback.test.ts`; typecheck and lint of changed files. No full suite, permission matrix or responsive suite repeated.
