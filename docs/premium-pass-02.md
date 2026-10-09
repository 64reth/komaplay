# Premium Pass 02 — Participation and continuity

Built on deployed Premium Pass 01, commit 147c44a0b1dfb53f0e38aaeae05eb71822c5144d.

## Changes

- One restrained Contribute link sits beside the existing article open-state indicator. It uses the existing catalogue lifecycle calculation and server-resolved account/membership snapshot through workshopAccess. Signed-out readers reach the existing sign-in boundary; members use the existing Workshop. Closed, expired and archived Panels have no contribution routes. Restricted/unavailable accounts do not receive the new contextual link. Workshop/RPC access enforcement is unchanged.
- Profile submission links now target the exact contribution card. Stable fragment IDs and scroll spacing bring that work into view; draft continuation still uses its existing exact draft ID.
- Accepted work says ACCEPTED · NOT YET PUBLISHED in member Profile and Workshop. Published/cited status still comes exclusively from existing authoritative publication data.
- Published attribution disclosures now say Panel Citation · P//NN instead of a cryptic code alone. The same public citation and credit data is used; anonymous attribution remains anonymous.

## Verification

12 targeted tests passed, covering open/closed/expired/archived eligibility, restricted account state, Workshop boundaries, acceptance/publication distinction, recovery and public citation labels.

Chrome at 1440px and 390px verified contextual access and archived restrictions. Disposable local SQL fixtures exercised Contribute → draft save → Profile → exact draft recovery → submit → Profile → exact submission → independent acceptance → independent incorporation review → publication. Published anonymous credits and readable citation disclosures were inspected at both widths. Profile links positioned the requested submission around 90px below the viewport top; no horizontal page overflow was observed. No production test data was created.

## Deliberately unchanged

Article composition, existing bylines above artwork, lower Workshop action, public data projections, private identity rules, editorial permissions, independent review, canonical publication/Issue lifecycle, draft persistence and unfinished writing tools. No new models, migrations, dependencies or social features.

## Remaining opportunities

The existing byline is already appropriately prominent. More elaborate author/contributor identity treatment would require separate editorial/privacy decisions and is not justified by this pass. Some long articles retain several existing lower participation prompts; consolidating those could be considered after observing use of the new contextual link. No additional prompt was added below the article.
