# Open Panel and publishing architecture

## Rendering and content

Public routes are server components. `lib/publication/server.ts` loads the RLS-filtered catalogue; `lib/publication/domain.ts` computes UTC lifecycle presentation, ordering and discovery. The original static paragraphs live in `data/editorial.ts`; a feature may instead supply database editorial text. Feature slugs do not encode their issue and remain stable when a draft moves.

`components/FeatureStrip.tsx` is the original interactive strip, now reusable without a cover-owned navigation callback. It renders real feature links, retaining no-JavaScript navigation, modified-click behaviour, wheel/touch/drag scrolling, controls and reduced motion. `WeeklyDropStrip` supplies issue/drop-derived typed items and context. Current/issue/archive/search components compose these independently of authentication.

A missing Supabase configuration uses `data/publication-demo.ts`, visibly marked as development preview. It does not grant synthetic authenticated sessions or fake successful writes. A configured database failure reports an unavailable state.

## Trust boundaries

1. Browser forms validate inputs for useful feedback.
2. API routes validate again, verify the authenticated Supabase user and load the profile role. Same-origin POST checks protect cookie-based mutations.
3. The database repeats ownership, role, visibility, lifecycle and validation checks. Direct table writes are revoked; function entry points are individually granted. Security-definer functions use an empty search path.
4. Storage owns private screenshots under a user UUID prefix. Server upload validates MIME, size and file signatures; bucket restrictions and RLS also apply to direct clients. SVG/video and arbitrary HTML embeds are not accepted.

The role column is never taken from client metadata. `public_profiles` exposes only ID, display name and avatar URL, not roles/email. Moderation writes use user sessions, not an administrative secret key.

## Transactions and history

- Acceptance locks the contribution and increments the feature revision in the same transaction as its curated addition, revision and audit.
- Members can alter only their own eligible proposals, never accepted records.
- Lifecycle wrappers guard the original save/withdraw/moderate functions; legacy entry points have no API execute grant.
- The issue's state/deadline and feature's override govern closure. Display state is derived at request time, so it does not await reconciliation.
- Finalising allows moderator reviews but not late member work. Archive prevents subsequent contribution decisions or editorial rewrites. Corrections have a distinct private table and append-only audit.
- Reconciliation updates only rows that need to change. It never publishes a late scheduled drop into a closed issue or automatically closes an unpublished draft.

## UI boundaries

`components/open-panel/` owns authentication gating, composition, personal submissions, contribution moderation, public additions/credits/revisions. `components/publication/` owns issues, weekly strips, archive/discovery, countdowns, corrections and administration. The publishing editors share a small validated form wrapper; no monolithic homepage or external admin-template dependency is introduced.

## Testing limits

The embedded SQL tests execute Postgres functions, constraints and RLS, including the authenticated and anon database roles. Auth and Storage system schemas are minimal stubs; these tests do not prove live email delivery, PKCE redirect configuration, Supabase Storage HTTP behaviour or production deployment configuration. Browser checks against the no-credentials development mode cover real SSR routes and interaction, not a fabricated successful production sign-in.
