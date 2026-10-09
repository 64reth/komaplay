# Premium Pass 01 — 9 October 2026

Based on the completed UX audit. This pass changes presentation and interaction only.

## Implemented

- Shared mastheads use the relevant Issue record on Home, Issue, Panel, Workshop and reporting routes; global/account surfaces use neutral Publication identification.
- Authentication closes back to its invoking control without scrolling; account tabs reuse the existing button treatment and minimum 44px height.
- Home normalises category and quick-filter aliases before filtering and presenting their selected state. An explicit recognised category wins conflicting aliases.
- Archive omits an empty standalone-Panel section. Navigation says Read the issue instead of recycling historical cover-label metadata. Saved artwork and metadata remain intact.
- Creator field errors appear after blur, or all submission requirements after a submit attempt/server failure. Untouched body controls remain neutral. Draft saving and server validation are unchanged.
- Profile calls contributions contributions, places existing next actions after drafts/revisions and before passive history, and tightens empty-section spacing.
- Home reduces masthead and weekly-section spacing without changing the wordmark, cards, rail, animation or publication composition.

## Verification

32 targeted tests passed (Home states, editorial validation, authentication and this pass's regression cases). Lint and generated-route typechecking passed. Chrome inspection at 1440px desktop and 390px touch-mobile covered Home, filtering, Issue, Archive, article reading/authentication, Profile and Creator.

First feature caption: approximately 918px → 860px desktop, 986px → 918px mobile. This is a restrained improvement; mobile still gives the existing artwork room before its caption. Profile's existing Explore Open Panels action moved from over 1100px to approximately 581px on mobile. No page overflow observed.

Disposable local fixtures verified untouched forms, blur feedback, incomplete save, invalid submission, save/reopen and successful submission. Public catalogue/media were read-only. No production fixtures, data changes or migrations required. Unfinished writing tools were preserved separately and excluded from deployment.

## Participation discovery — recommendations only

The eligible article header communicates Open Panel and the deadline. Its actual Open the Workshop link is below the article, followed by contribution guidance. This is contextual for readers who finish, but the non-actionable header state makes participation less discoverable earlier. Home's Open Panels filter helps readers find eligible material but does not itself explain the contribution action.

For the next small batch, consider one restrained Contribute link beside the existing open-state/deadline, leading directly to the existing Workshop. Use the same authoritative eligibility already used by the lower action. Keep the existing lower action for readers finishing the article. Do not add banners, floating controls, notifications or duplicate onboarding. Archived/closed Panels must retain their correction/report route and must not gain a contribution action.

No participation workflow or permission changes are included in this pass.
