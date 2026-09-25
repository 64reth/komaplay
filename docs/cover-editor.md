# Cover Editor

`/cover-editor` is the template-driven issue packaging tool. Active **Moderators** and **Admins** can open it; Editorial Contributors cannot. The database repeats that role check for every save.

It extends the existing issue record with cover artwork and accessible alt/credit metadata, a published lead panel and headline, theme, four constrained secondary-line positions, editor-note teaser, featuring line, and one of four presets: Minimal, Feature-heavy, Interview/special, or Archive/classic. Alignment belongs to these templates only. Editorial and Workshop Markdown remain unchanged.

Saving records a narrow audit entry. Moving an issue to `archived` is blocked at the database boundary until the cover has artwork, alt text, a valid published lead panel/headline, and at least one public panel. The existing issue-close RPC remains the only archive operation. Draft/current covers do not appear on the Archive shelf; archived issues render as magazine cover cards linking to the existing issue page.

Native browser spellcheck is enabled for relevant Cover Editor, Editorial Dashboard, and Workshop writing fields. No writing is sent to an external service and no automatic correction is applied.

Image uploads use latest-selection-wins coordination. Replacing or removing artwork cancels the active request and ignores stale completions. Incomplete cover metadata can be saved privately; the existing archive transition still requires complete artwork, alt text, lead panel and headline.

## Production verification

1. Sign in as Moderator or Admin and open `/cover-editor`; confirm a lower role receives the access gate.
2. Select the current issue, choose/upload artwork, add alt text and a lead panel, save, and check desktop plus 390px previews.
3. Confirm incomplete covers cannot archive. Archive a complete eligible issue only when operationally intended.
4. Confirm `/archive` shows only archived cover cards and the card opens `/issues/:slug` with its public panels.
5. Confirm Editorial and Workshop spellcheck works and their stored Markdown is unchanged.

## Rollback

Roll back the Worker to the preceding version. The migration is additive; leave cover columns and audit records in place. Removing them is unnecessary and would discard editorial metadata. The archive guard can be dropped independently only during an emergency database rollback.
