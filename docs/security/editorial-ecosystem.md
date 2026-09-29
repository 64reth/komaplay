# Editorial ecosystem: identity, feedback and discovery

Phase 1 remains the privacy baseline. This programme adds one additive migration (`202609290004_editorial_ecosystem`) without changing public projections, role permissions, original provenance, storage policies, independent-review requirements or Cover Pool access.

## Product surfaces

- Canonical PNG keyring badges replace the experimental SVG rendering. One 40px/48px image reflects actual role plus editorial access. A legacy reviewer is two keys, never Moderator; actual Moderator/Admin are three/four. Profile and private desk identities use the badge. Public bylines never derive badges from an account.
- Private Profile connects recoverable drafts, truthful statuses, authored published panels, citations, Issues actually contributed to and Saved. Earned private citations survive public takedown, but unavailable panels are not linked or counted as currently published.
- Profile contains a finite, 50-message private Inbox with read/unread controls. Home shows at most two unread previews. Existing editorial transitions create duplicate-safe status/response/incorporation/citation/publication events; scheduled visibility is reconciled on the member's next visit. Event keys/read state persist to prevent duplicate delivery. No public feed, emails, polling service or social messaging.
- Optional broad preferences reuse private `profiles.interests`: Gaming, Anime, Culture, Manga, or Skip. Existing values are retained until explicit member choice. Future genre expansion can be additive; none is implemented. Onboarding and Settings share the same choices. These emphasise discovery, never restrict the catalogue.
- Personal Home adds a compact, finite briefing for Continue, Saved, meaningful Inbox updates, interests and Open Panels. The existing Issue and weekly strips remain the main publication.
- Search now matches Issue/category/format metadata as well as panel text/topics. Four broad category filters reuse the taxonomy. Only populated Week 01–04 strips appear on Home, in week order.
- Slow optional desktop drift begins after a short delay, stops on hover/focus/pointer/wheel/keyboard interaction, ends at the rail boundary and has explicit play/pause. Touch remains manual, reduced motion stays still, and offscreen/hidden tabs suspend animation. Existing keyboard/manual navigation remains available.

## Security and rollout

New `member_inbox` is RLS protected to its active, handbook-accepted recipient only, including against staff browsing other members' Inbox. Clients cannot insert events or invoke trigger helpers. Read updates are authenticated owner-scoped RPCs. All definer functions have an empty search path and qualified table names. Preferences validate both RPC and direct profile updates; they cannot change roles. Private Home/Profile responses are no-store and vary by Cookie.

Migrate → verify current history and rollback-only production RPC/RLS smoke → commit/push tested source → deploy Worker with existing secrets preserved → production browser/media/privacy smoke → scoped fixture cleanup. Old Worker remains compatible with this additive schema. No privacy rollback is needed or permitted.

## Asset handling and deliberate limits

The four source PNG files were copied byte-for-byte from the user-provided repository assets; SHA-256 values were checked. They were not regenerated, edited or optimised. Existing `public/assets/badges/key-ring-*.svg` experiments remain unused for historical compatibility; remove them in a future asset-cleanup change after checking external references. They are not a fallback.

No XP, promotion, scores, reactions, public history, followers, leaderboards, streaks, chat, franchise/genre onboarding or infinite feeds. No retroactive rewriting of provenance. Public media retains the Phase 1 opaque gateway and private originals.

## Validation

The full suite includes the complete migration chain and anonymous/named same-account attribution tests. Additional tests cover invalid preferences/direct-update bypass, no role escalation, owner/staff/anonymous Inbox isolation, forged-event denial, duplicate reads, read-state mutation, suspended accounts and private citation history. `scripts/ecosystem-production-checks.sql` rehearses production roles in one rolled-back transaction. Browser checks cover canonical badge dimensions, preference interaction, Inbox UI, motion pause/manual/reduced-motion behaviour and 390px/1440px overflow, alongside existing attribution and Workshop recovery suites. Production outcomes are recorded separately after deployment.
