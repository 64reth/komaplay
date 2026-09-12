import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bodyModules, draftDocument, draftSchema, editorialStatusLabel } from "../../router-app/lib/editorial-alpha";

const migration = readFileSync("supabase/migrations/202609120001_editorial_alpha_rpc.sql", "utf8");
const profileRoute = readFileSync("router-app/routes/profile.tsx", "utf8");
const moderationRoute = readFileSync("router-app/routes/moderation.tsx", "utf8");
const editorialRoute = readFileSync("router-app/routes/editorial.tsx", "utf8");
const submitFeedbackMigration = readFileSync("supabase/migrations/202609120002_editorial_alpha_submit_feedback.sql", "utf8");
const myDraftsMigration = readFileSync("supabase/migrations/202609120003_editorial_alpha_my_drafts.sql", "utf8");
const lifecycleMigration = readFileSync("supabase/migrations/202609120004_editorial_alpha_lifecycle.sql", "utf8");

test("profile exposes editorial navigation only through capability checks", () => {
  assert.match(profileRoute, /capabilities\.editorial/);
  assert.match(profileRoute, /to="\/editorial"/);
  assert.match(profileRoute, /capabilities\.moderation/);
  assert.match(profileRoute, /to="\/moderation"/);
});

test("editorial grants require an active administrator and avoid duplicate active grants", () => {
  assert.match(migration, /actor\.role<>'admin'/);
  assert.match(migration, /actor\.account_status<>'active'/);
  assert.match(migration, /revoked_at is null limit 1/);
  assert.match(migration, /on conflict\(id\) do nothing/);
});

test("draft validation builds shared-renderer documents and preserves stable module ids", () => {
  const parsed = draftSchema.parse({
    title: "Tōkon beginner guide",
    slug: "tokon-beginner-guide",
    summary: "A practical draft summary.",
    sections: "## Meter\n\nHold resources until defence is stable.",
    image: "/assets/koma-vhs-v2.svg",
    imageAlt: "A monochrome KOMA://PLAY VHS illustration.",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  const doc = draftDocument(parsed);
  assert.equal(doc.header.title, "Tōkon beginner guide");
  assert.equal(doc.modules[0].id, "lead-image");
  assert.equal(doc.modules.at(-1)?.id, "video-1");
  assert.deepEqual(bodyModules(parsed.sections).map((module) => module.id), ["section-1", "paragraph-2"]);
});

test("draft validation blocks unsupported video providers and image modules without alt text", () => {
  assert.throws(() => bodyModules("## Source\n\nUseful note", "https://example.com/embed.html"), /supported YouTube or Twitch/);
  const parsed = draftSchema.parse({ title: "Image draft", slug: "image-draft", summary: "Summary text", sections: "## Body\n\nCopy for this draft.", image: "/assets/koma-vhs-v2.svg" });
  const doc = draftDocument(parsed);
  assert.equal(doc.modules[0].type, "image");
  assert.equal(doc.modules[0].content.alt, "");
});

test("review actions stop at publish-ready approval rather than fake live publication", () => {
  assert.match(migration, /next_status:='approved'/);
  assert.match(migration, /Approved as publish-ready/);
  assert.doesNotMatch(migration, /lifecycle_status='published'/);
  assert.match(moderationRoute, /Draft approved as publish-ready/);
});


test("editorial save and submit return visible lifecycle feedback", () => {
  assert.match(editorialRoute, /Submitted for review/);
  assert.match(editorialRoute, /role=\"status\"/);
  assert.match(editorialRoute, /role=\"alert\"/);
  assert.match(editorialRoute, /useFetcher<typeof action>/);
  assert.match(editorialRoute, /<fetcher\.Form/);
  assert.match(editorialRoute, /value=\{draft\.featureId/);
  assert.match(editorialRoute, /name="intent" value="save"/);
  assert.match(editorialRoute, /name="intent" value="submit"/);
});

test("submitted drafts upsert by the editor draft slug and appear in moderation with safe identity", () => {
  assert.match(submitFeedbackMigration, /where f\.slug=trim\(payload->>'slug'\)/);
  assert.match(submitFeedbackMigration, /ed\.author_id=auth\.uid\(\)/);
  assert.match(submitFeedbackMigration, /ed\.lifecycle_status in \('submitted','approved','changes_requested'\)/);
  assert.match(submitFeedbackMigration, /author_display_name/);
  assert.match(moderationRoute, /No submitted drafts waiting/);
  assert.match(moderationRoute, /author_display_name/);
});


test("editorial composer preview is driven by live client state", () => {
  assert.match(editorialRoute, /useState<ComposerState>/);
  assert.match(editorialRoute, /useMemo\(\(\) =>/);
  assert.match(editorialRoute, /draftDocument\(draft\)/);
  assert.match(editorialRoute, /onChange=\{update\("title"\)\}/);
  assert.match(editorialRoute, /onChange=\{update\("summary"\)\}/);
  assert.match(editorialRoute, /onChange=\{update\("sections"\)\}/);
  assert.doesNotMatch(editorialRoute, /ArticleRenderer document=\{emptyPreview\}/);
});


test("editor saved drafts load through a server-checked RPC instead of draft feature RLS", () => {
  assert.match(editorialRoute, /rpc\("editorial_my_work"\)/);
  assert.match(lifecycleMigration, /create or replace function public\.editorial_my_work/);
  assert.match(myDraftsMigration, /ed\.author_id=auth\.uid\(\)/);
  assert.match(myDraftsMigration, /public\.editorial_has_access\(auth\.uid\(\),false\)/);
  assert.match(lifecycleMigration, /grant execute on function public\.editorial_my_work\(\),public\.editorial_review_inbox\(\) to authenticated/);
});

test("editorial composer shows the latest saved draft immediately after action success", () => {
  assert.match(editorialRoute, /aria-label="Latest saved draft"/);
  assert.match(editorialRoute, /Just now/);
  assert.match(editorialRoute, /draft\.title/);
});


test("saved draft cards can reopen the composer for editing", () => {
  assert.match(editorialRoute, /CONTINUE/);
  assert.match(editorialRoute, /REVISE/);
  assert.match(editorialRoute, /onClick=\{\(\) => loadDraft\(item\)\}/);
  assert.match(editorialRoute, /composerFromWorkItem\(selected\)/);
  assert.match(editorialRoute, /useSearchParams/);
  assert.match(profileRoute, /CONTINUE/);
});

test("profile My Panels lists editorial work alongside Open Panel contributions", () => {
  assert.match(profileRoute, /MY PANELS/);
  assert.match(profileRoute, /editorial_my_work/);
  assert.match(profileRoute, /Open Panel Contribution/);
  assert.match(profileRoute, /Editorial access is granted by moderators/);
});

test("changes requested and approved statuses are visible to editors", () => {
  assert.match(editorialRoute, /Reviewer note/);
  assert.match(lifecycleMigration, /Changes requested:/);
  assert.equal((editorialStatusLabel("changes_requested")), "Changes requested");
  assert.equal((editorialStatusLabel("approved")), "Publish-ready");
});


test("panel directory pattern is shared by profile editorial and moderation queues", () => {
  const directory = readFileSync("router-app/components/PanelDirectory.tsx", "utf8");
  const css = readFileSync("router-app/app.css", "utf8");
  assert.match(directory, /export function PanelDirectory/);
  assert.match(directory, /role="table"/);
  assert.match(directory, /data-label="Status"/);
  assert.match(css, /\.panel-directory-row/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(profileRoute, /<PanelDirectory label="My Panels"/);
  assert.match(editorialRoute, /<PanelDirectory label="Editorial panels"/);
  assert.match(moderationRoute, /<PanelDirectory label="Review Inbox"/);
});

test("editorial preview uses the KOMA placeholder when no image is set", () => {
  const parsed = draftSchema.parse({
    title: "No image panel",
    slug: "no-image-panel",
    summary: "A panel with no uploaded image yet.",
    sections: "## Body\n\nCopy for this draft preview.",
  });
  const doc = draftDocument(parsed);
  assert.equal(doc.header.hero?.src, "/assets/koma-feature-placeholder.svg");
  assert.equal(doc.header.hero?.alt, "KOMA://PLAY editorial placeholder");
});


test("draft directory rows can submit directly and publish-ready copy is explicit", () => {
  assert.match(editorialRoute, /SUBMIT FOR REVIEW/);
  assert.match(editorialRoute, /name="intent" value="submit"/);
  assert.match(editorialRoute, /name="featureId" value=\{item\.feature_id\}/);
  assert.match(moderationRoute, /Publishing to the live strip is next/);
  assert.doesNotMatch(moderationRoute, /PUBLISH FEATURE/);
});
