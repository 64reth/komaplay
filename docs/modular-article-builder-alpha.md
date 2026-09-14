# Modular Article Builder alpha

The Editorial Creator in the React Router application offers eight body section types: paragraph, heading, image, quote, bullet list, numbered list, YouTube/Twitch video, and divider. Add appends a section; move up/down and remove operate on stable section IDs. Paragraph formatting is limited to bold, italic, and safe links.

Title, slug, summary, content format, and feature image/alt remain above the body. Content format remains Essay, as fixed by the existing save RPC. The existing accessible hero placeholder remains available. Image sections support the existing upload route, a URL/path, alt text, and an optional caption.

Ordered body sections persist as the existing `working_document.modules` array. Empty draft sections retain their identity and position. Review and public pages already use the shared ArticleRenderer with that array. New modular documents render the hero once in the header. Old body text can reopen as one paragraph; older document modules retain order, and advanced legacy modules remain preserved without exposing a raw JSON/HTML editor. No migration is required.

Saving permits incomplete body sections. Both composer submission and submission from MY PANELS check empty sections, image alt text, and trusted video URLs. Invalid JSON, unsupported section types, and duplicate IDs are rejected. Existing advanced modules are recovered from the saved document on the server, rather than accepting replacement content from the form.

Validation:

- `pnpm typecheck`
- `pnpm test` (114 tests, including 16 modular-builder cases)
- `pnpm build`
- `git diff --check`
- `node scripts/smoke-modular-builder.mjs` — Chromium exercises all section types, editing, move/remove, alt validation, draft JSON save/reopen, and shared preview order. This uses an isolated in-memory persistence harness, not production RPCs. It writes a mobile screenshot to `test-results/`.

The remaining live smoke needs authenticated editor/moderator access: create heading → paragraph → image → paragraph → quote → video → divider, save, leave/reopen, submit, approve/publish, then confirm public order. This has not been completed by the automated harness.

Deployment uses the generated server configuration and explicitly targets `komaplay` while preserving its configured variables. Wrangler's `--name`, `--keep-vars`, and `--dry-run` options are documented in the [Cloudflare command reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
