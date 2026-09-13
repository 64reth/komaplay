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
const canonicalLifecycleMigration = readFileSync("supabase/migrations/202609130002_canonical_editorial_lifecycle.sql", "utf8");

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

test("review actions use canonical publish-ready status rather than fake live publication", () => {
  assert.match(canonicalLifecycleMigration, /next_status:='approved'/);
  assert.match(canonicalLifecycleMigration, /Marked publish-ready/);
  assert.match(canonicalLifecycleMigration, /approved.*temporarily/);
  assert.match(canonicalLifecycleMigration, /case when ed\.lifecycle_status='approved' then 'publish_ready'/);
  assert.doesNotMatch(canonicalLifecycleMigration, /lifecycle_status='published'/);
  assert.match(moderationRoute, /Panel marked publish-ready/);
});


test("editorial save and submit return visible lifecycle feedback", () => {
  assert.match(editorialRoute, /Submitted for review/);
  assert.match(editorialRoute, /role=\"status\"/);
  assert.match(editorialRoute, /role=\"alert\"/);
  assert.doesNotMatch(editorialRoute, /useFetcher/);
  assert.match(editorialRoute, /<Form method="post" action="\/editorial" className="op-form"/);
  assert.match(editorialRoute, /value=\{draft\.featureId/);
  assert.match(editorialRoute, /name="intent" value="save"/);
  assert.match(editorialRoute, /name="intent" value="submit"/);
  assert.match(editorialRoute, /name="intent" value="submit-existing"/);
});

test("submitted drafts upsert by the editor draft slug and appear in moderation with safe identity", () => {
  assert.match(submitFeedbackMigration, /where f\.slug=trim\(payload->>'slug'\)/);
  assert.match(submitFeedbackMigration, /ed\.author_id=auth\.uid\(\)/);
  assert.match(canonicalLifecycleMigration, /ed\.lifecycle_status in \('submitted','changes_requested','approved'\)/);
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

test("changes requested and publish-ready statuses are visible to editors", () => {
  assert.match(editorialRoute, /Reviewer note/);
  assert.match(canonicalLifecycleMigration, /Changes requested:/);
  assert.equal((editorialStatusLabel("changes_requested")), "Changes requested");
  assert.equal((editorialStatusLabel("publish_ready")), "Publish-ready");
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
  assert.match(editorialRoute, /name="intent" value="submit-existing"/);
  assert.match(editorialRoute, /name="featureId" value=\{item\.feature_id\}/);
  assert.match(moderationRoute, /Publishing to the live strip is next/);
  assert.doesNotMatch(moderationRoute, /PUBLISH FEATURE/);
});


test("submit existing editorial draft rpc moves saved drafts to review", () => {
  const submitMigration = readFileSync("supabase/migrations/202609120005_submit_editorial_draft.sql", "utf8");
  assert.match(submitMigration, /create or replace function public\.submit_editorial_draft\(target uuid\)/);
  assert.match(submitMigration, /lifecycle_status='submitted'/);
  assert.match(submitMigration, /Submitted for review/);
  assert.match(submitMigration, /doc\.author_id<>auth\.uid\(\) and not can_review/);
  assert.match(editorialRoute, /intent === "submit-existing"/);
  assert.match(editorialRoute, /intent === "submit" && !form\.has\("title"\)/);
  assert.match(editorialRoute, /Saved panel id is missing/);
  assert.match(editorialRoute, /rpc\("submit_editorial_draft"/);
  assert.match(editorialRoute, /name="intent" value="submit-existing"/);
});


test("shared review inbox is editor visible and keeps drafts private", () => {
  const sharedInboxMigration = readFileSync("supabase/migrations/202609130001_shared_editorial_review_inbox.sql", "utf8");
  assert.match(sharedInboxMigration, /public\.editorial_has_access\(auth\.uid\(\),false\)/);
  assert.match(canonicalLifecycleMigration, /ed\.lifecycle_status in \('submitted','changes_requested','approved'\)/);
  assert.doesNotMatch(sharedInboxMigration, /ed\.lifecycle_status in \('draft'/);
  assert.match(sharedInboxMigration, /left join public\.profiles/);
  assert.match(moderationRoute, /capabilities\.editorial \|\| capabilities\.moderation/);
  assert.match(moderationRoute, /Moderator access is required to approve or request changes/);
});


test("canonical lifecycle views are status-driven", () => {
  assert.match(canonicalLifecycleMigration, /public\.editorial_documents/);
  assert.match(canonicalLifecycleMigration, /Storage keeps legacy 'approved' temporarily/);
  assert.match(canonicalLifecycleMigration, /ed\.author_id=auth\.uid\(\)[\s\S]*ed\.lifecycle_status in \('draft','submitted','changes_requested','approved'\)/);
  assert.match(canonicalLifecycleMigration, /public\.editorial_has_access\(auth\.uid\(\),false\)[\s\S]*ed\.lifecycle_status in \('submitted','changes_requested','approved'\)/);
  assert.doesNotMatch(canonicalLifecycleMigration, /editorial_review_inbox[\s\S]*ed\.lifecycle_status in \('draft'/);
  assert.match(canonicalLifecycleMigration, /doc\.lifecycle_status not in \('draft','changes_requested'\)/);
});

test("actions fail visibly when lifecycle RPCs reject", () => {
  assert.match(editorialRoute, /role="alert"/);
  assert.match(moderationRoute, /role="alert"/);
  assert.match(canonicalLifecycleMigration, /This panel is not editable in its current status/);
  assert.match(canonicalLifecycleMigration, /Only draft or changes-requested panels can be submitted for review/);
});


test("row submit is a minimal normal form action", () => {
  assert.match(editorialRoute, /<Form method="post" action="\/editorial">/);
  assert.match(editorialRoute, /name="intent" value="submit-existing"/);
  assert.match(editorialRoute, /name="featureId" value=\{item\.feature_id\}/);
  assert.doesNotMatch(editorialRoute, /name="title" value=\{item\.title \?\?/);
  assert.match(editorialRoute, /useActionData<typeof action>/);
  assert.match(editorialRoute, /const response = routeActionData/);
});


test("composer persistence uses the route action result", () => {
  assert.match(editorialRoute, /<Form method="post" action="\/editorial" className="op-form">/);
  assert.match(editorialRoute, /name="title"/);
  assert.match(editorialRoute, /name="slug"/);
  assert.match(editorialRoute, /name="summary"/);
  assert.match(editorialRoute, /name="sections"/);
  assert.match(editorialRoute, /name="intent" value="save"/);
  assert.match(editorialRoute, /name="intent" value="submit"/);
  assert.match(editorialRoute, /rpc\("save_editorial_draft"/);
  assert.match(editorialRoute, /const response = routeActionData/);
  assert.match(editorialRoute, /Draft saved\./);
  assert.match(editorialRoute, /Submitted for review\./);
});


test("temporary editorial action trace exposes safe action details", () => {
  assert.match(editorialRoute, /debugTrace/);
  assert.match(editorialRoute, /actionReached/);
  assert.match(editorialRoute, /titlePresent/);
  assert.match(editorialRoute, /slugPresent/);
  assert.match(editorialRoute, /featureIdPresent/);
  assert.match(editorialRoute, /rpcCalledName/);
  assert.match(editorialRoute, /rpcSuccess/);
  assert.match(editorialRoute, /resultingLifecycleStatus/);
  assert.match(editorialRoute, /TEMP EDITORIAL TRACE/);
  assert.doesNotMatch(editorialRoute, /cookie/i);
  assert.doesNotMatch(editorialRoute, /email/i);
});
