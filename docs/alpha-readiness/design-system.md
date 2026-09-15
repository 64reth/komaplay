# Existing Alpha design system

The implementation lives in `router-app/app.css`; reuse these values and component patterns rather than adding another theme. This pass retains its geometry and typography.

- Paper: `--color-paper: #f3efe5`; ink/borders `#0a0a0a`; raised surface `#faf7ef`.
- Action accent `#ef3027`, hover `#c92520`; focus `#9e2a24`; danger `#a32620`. Existing legacy ink/paper/red aliases remain supported.
- Shared components: Masthead/IssueNavigation, FeatureStrip, PanelDirectory, ArticleRenderer, WritingToolbar, ArticleSectionBuilder, EditorialErrors, account dialog and Pocket Guide flow.
- Editorial controls use `op-button`, `action-primary`, `op-form`, associated labels and explicit pending states. Status badges display lifecycle text; colour never supplies the only meaning.
- Submission outcomes use separate saved/submitted/blocked classes. Errors associate through stable section IDs, `aria-invalid`, `aria-describedby`, an announced summary and focus to the first actionable control.
- Tooltips do not replace labels. Newly added Google, retry, account-access and verification controls use visible instructions; no hover-only dependency was introduced.
- Existing responsive strip/layout and reduced-motion behaviour remain. The pass checks desktop and 390px mobile editor/auth fixtures; it does not introduce a new breakpoint system.
- New platform notice and operations controls reuse publication article/form styling. No new logo, font family, component library or visual language.

Failure/recovery: pending actions remain explicit; draft errors preserve entered content. Navigation warns before abandoning unsaved work. Quota and stale-save recovery messages use plain language and do not reveal internal limits. Sign-in cancellation and connection failure have distinct recovery messages.
