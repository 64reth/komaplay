# Premium Pass 03 — Visual craftsmanship

Baseline: deployed Premium Pass 02, eae2e4baa0af94d04b0f653364b9a44abf41389d.

## Confirmed observations and changes

Chrome inspection at 1440px and 390px found four participation links on an open article, including three after the body. Retained the contextual header link and immediate after-article Workshop action. Removed the empty-section invitation and repeated footer action, retaining the empty publication state, credits, additions, revision history and return-to-Issue link. Closed articles retain correction access.

The account menu stayed open after Escape and outside clicks. It now supports arrow navigation, Home/End, Escape with focus restoration, forward/reverse Tab exit and outside-pointer dismissal. Menu controls use consistent uppercase presentation and 44px targets (previous rows measured 39px; desktop trigger 31px). Long menus can scroll within the viewport. The authentication close control also uses a 44px target.

Disabled editor buttons previously inverted on hover. Disabled controls now remain inert; enabled shared buttons/menu items/archive cards use existing 160ms colour transitions. Archive cards receive the same surface treatment on keyboard focus as hover. Reduced-motion preferences remove these transitions.

Search's shared navigation field was blank even with an active query. It now retains that query. Article, Issue, Workshop and reporting navigation use their authoritative parent Issue to indicate Current issue or Archive context with aria-current=location; exact navigation pages retain aria-current=page.

## Preserved

Reading font scale/line height/measure, article columns, artwork and cropping, Home masthead and Feature Strip composition/movement, published attribution, editorial permissions, independent review, Issue lifecycle, canonical keyring assets and unfinished writing tools. No redesign, new dependency, migration or production fixture.

## Verification

- 24 targeted tests: navigation/query continuity, participation/closed-state rules, Home 0/1/many states and authentication rendering.
- Chrome desktop/mobile: menu keyboard navigation and dismissal, target sizes, disabled hover, reduced motion, authentication focus return, query persistence, current/archive orientation and article invitation count.
- Disposable local fixtures: contribution save, exact draft recovery, submission, Profile return, independent acceptance/incorporation review/publication and anonymous citation all passed.
- No horizontal page overflow observed in the final public/private checks.

## Remaining considerations

No confirmed blocker remains from this pass. The established large masthead and two-column reading composition are deliberate and unchanged. Broader typography homogenisation or article restructuring would be a redesign rather than an evidence-led correction. Future visual polish should be part of routine feature delivery rather than another broad pass.
