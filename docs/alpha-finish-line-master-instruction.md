# KOMA://PLAY Alpha Finish-Line Pass — Master Instruction

The objective is to turn the existing product into a cohesive, dependable package.

> KOMA://PLAY feels simple because the complexity underneath has been handled properly.

Conduct and complete the KOMA://PLAY Alpha Finish-Line Pass with stability as the overriding priority.

Treat this as hardening and completing the existing product—not redesigning it, adding speculative features or replacing established architecture.

Work through the following areas systematically. Diagnose first, then implement, test, commit, push and deploy completed production-safe work. Do not leave partially connected UI or pretend functionality. Stop only for a genuine security, legal, authentication, destructive-data or credential blocker.

## 1. Feature Strip publishing pipeline

Verify the complete pipeline:

`editor selection → feature configuration → image upload → storage → persisted reference → preview → publish → production rendering`

Ensure:

* An authorised editor can upload a Feature Strip image.
* Accepted file types, dimensions and size limits are clearly communicated.
* Invalid, oversized or corrupted files are rejected safely.
* Upload progress, success and failure are visible.
* Retry does not create duplicate records or orphaned assets.
* Replacing an image behaves predictably.
* Saved images survive reopening and deployment.
* Preview and published output use the same persisted source.
* Missing images have an intentional fallback.
* Alt text is required before publishing.
* Feature links resolve to the correct canonical panel.
* Unauthorised users cannot upload, alter, feature or publish content.
* Double-clicking or resubmitting cannot duplicate Feature Strip entries.

Add integration and browser regression coverage for upload, persistence, preview and published display.

## 2. Stability and abuse resistance

Audit all critical journeys:

* Sign up and sign in
* Membership onboarding
* Create and edit panel
* Save and reopen draft
* Reorder/delete modular sections
* Submit for review
* Request and make revisions
* Approve and publish
* Feature Strip assignment
* Public reading
* Archive and authorised takedown

Test and harden against:

* Repeated and rapid button presses
* Slow, interrupted and failed requests
* Refresh/navigation during editing
* Stale sessions
* Concurrent edits and stale updates
* Empty, malformed and unusually long input
* Unsupported URLs and hostile markup
* Missing profiles or display names
* Duplicate submissions
* Direct unauthorised requests
* Broken or deleted media
* Partial database failures
* Mobile viewport and keyboard use

Lifecycle mutations must be transactional or safely recoverable. Buttons must communicate pending state and prevent accidental duplicate actions. Errors must preserve the user’s work.

Do not expose raw database, RPC, stack-trace or server messages in the interface.

## 3. Site-wide guidance

Audit every page and workflow for moments where a user may reasonably wonder:

* What is this?
* What am I expected to do?
* What happens next?
* Did my action work?
* Why can’t I continue?
* Is my work safe?

Add concise guidance using the appropriate pattern:

* Persistent signposting for important concepts
* Inline guidance for form requirements
* Tooltips for unfamiliar controls
* Empty-state instructions
* Confirmation messages for completed actions
* Clear pending states
* Actionable validation messages

Tooltips must supplement visible labels, not replace them. They must work with mouse, keyboard and touch, and must be accessible to assistive technology.

Keep the language plain, calm, encouraging and editorially consistent. KOMA should feel confident—not chatty, bureaucratic or technical.

## 4. Google authentication

Complete and verify Google sign-in through Supabase:

* Existing and new-user flows
* Correct redirect URLs for local and production environments
* Account/profile creation
* Onboarding and handbook acceptance
* Return to the originally requested page
* Sign-out and session expiry
* Duplicate-email/account-linking behaviour
* Cancelled or failed authentication
* No open redirects or leaked authentication details

Do not disturb the working authentication methods. If configuration requires dashboard credentials or provider changes, document the exact action and stop only for that blocker.

## 5. Technical SEO and sharing

Implement and verify:

* Unique page titles and descriptions
* Canonical URLs using `https://komaplay.com`
* Correct Open Graph and social-sharing metadata
* Article-specific share images where available
* Sitemap containing only public canonical pages
* Appropriate `robots.txt`
* No indexing of drafts, Workshop, review, account or admin routes
* Semantic heading structure
* Descriptive image alt text
* Structured article/editorial data where appropriate
* Helpful 404 and unavailable-content behaviour
* Permanent `komaplay.co.uk` → `komaplay.com` redirect plan

Avoid duplicate indexing across lifecycle routes, slugs and domains.

## 6. Trust, privacy and compliance

Audit existing data collection and produce only pages and controls relevant to the real product:

* About KOMA://PLAY
* Privacy notice
* Terms of use
* Community/editorial guidelines
* Content ownership and contribution licence
* Public credit and attribution policy
* Moderation, reporting and takedown process
* Corrections and revisions policy
* Cookie notice and consent only where legally required by the technologies actually used
* Accessibility statement
* Age expectations and safeguarding language appropriate to the real audience
* Editorial and external-link disclaimers

Do not claim legal certification or guaranteed compliance. Clearly mark wording that requires owner/legal review. Ensure the implemented interface matches what the policies say the platform actually does.

## 7. Bot, spam and phantom-account protection

Design layered abuse protection across registration, authentication, profile creation, contributions, submissions and public interactions.

Use progressive friction: normal members should barely notice it, while automated account creation and content flooding become expensive and ineffective.

Protect against:

* Automated account creation
* Disposable-email account farms
* Duplicate or impersonating profiles
* Automated contribution and submission flooding
* Repeated links, promotional spam and malicious URLs
* Rapid lifecycle-action abuse
* Scraping and high-volume endpoint requests
* Users bypassing interface limits through direct requests

Implement appropriate controls:

* Verified authentication before profile or contribution creation
* Supabase authentication rate limits and secure session handling
* Cloudflare Turnstile on high-risk unauthenticated or suspicious flows
* Server-side rate limits for account, profile, contribution, upload and submission actions
* Per-account cooldowns and sensible daily limits
* Idempotency protection against duplicate requests
* Honeypot fields where useful
* Minimum completion time checks for automated form submissions
* Server-side input and URL validation
* File-upload type, size and frequency limits
* Duplicate-content detection and spam heuristics
* Account age or trust requirements for higher-impact actions where appropriate
* Report, suspend and block controls for authorised moderators
* An audit trail for moderation and suspicious lifecycle actions

Use progressive enforcement:

1. Silently reject obvious automation.
2. Add a verification challenge for suspicious activity.
3. Temporarily throttle repeated abuse.
4. Place questionable submissions into moderation.
5. Suspend confirmed abusive accounts while preserving an audit record.

Requirements:

* Never rely solely on client-side controls.
* Do not rely solely on CAPTCHA or Turnstile.
* Do not reveal exact detection thresholds to users.
* Avoid invasive fingerprinting and unnecessary personal-data collection.
* Do not permanently block users because of one shared IP address.
* Provide helpful messages for legitimate users caught by a limit.
* Make limits configurable rather than scattered as hard-coded values.
* Ensure bot protection does not break keyboard access, screen readers or ordinary Google sign-in.
* Document what data is processed for abuse prevention in the Privacy Notice.

Preferred legitimate-user message:

> We’ve received several requests in a short time, so this action has been paused briefly. Your work is safe—please try again in a few minutes.

Never expose messages such as:

* “Bot score failed”
* “IP blocked”
* Internal rate-limit thresholds
* Raw Cloudflare or Supabase errors

Add automated coverage for rapid repeated requests, duplicate submissions, direct endpoint access, failed challenges, safe retry and preservation of legitimate user work.

Google/email verification does not prove someone’s real-world identity. Describe accounts as **authenticated members**, not “verified people”, unless genuine identity verification is introduced later. Abuse protection can reduce fake and automated accounts; it must not imply that every member is a verified real-world person.

## 8. Quality gate

Before production completion, require:

* Typecheck
* Full automated test suite
* Production build
* `git diff --check`
* Permission and lifecycle tests
* Auth regression tests
* Bot-protection tests: rapid repeated requests, duplicate submissions, direct endpoint access, failed challenges, safe retry and preservation of legitimate user work
* Abuse-protection accessibility checks, including keyboard/screen-reader use and ordinary Google sign-in
* Feature Strip upload/publish browser test
* Core editorial browser journey
* Mobile viewport checks
* Keyboard accessibility checks
* Production route/link/metadata checks
* No secrets, tokens or unrelated changes

Maintain an Alpha Readiness report with:

* Verified journeys
* Defects repaired
* Remaining blockers
* Configuration actions requiring the owner
* Abuse controls verified, configuration still needed, and known protection gaps
* Compliance copy requiring review
* Commit SHA and Worker version
* Exact final production smoke-test checklist

Preserve the existing monochrome manga editorial identity. The finished product should feel like a neat, high-quality package with a small number of powerful, dependable tools.

“Abuse resistant” means predictable failure, protected data, strict permissions and recoverable user work. Keep this pass focused on a dependable alpha, not infinite scalability.
