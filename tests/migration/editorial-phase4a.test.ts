import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bodyModules, draftDocument, draftSchema, editorialStatusLabel } from "../../router-app/lib/editorial-alpha";
import { submissionCopy, validateEditorialSubmission } from "../../router-app/lib/editorial-validation";
import { applyWritingTool } from "../../router-app/components/WritingToolbar";

const migration = readFileSync("supabase/migrations/202609120001_editorial_alpha_rpc.sql", "utf8");
const profileRoute = readFileSync("router-app/routes/profile.tsx", "utf8");
const rawModerationRoute = readFileSync("router-app/routes/moderation.tsx", "utf8");
const moderationRoute = rawModerationRoute.replace(/\s+/g, " ").replace(/([({])\s+/g, "$1").replace(/\s+([)}])/g, "$1");
const editorialRoute = readFileSync("router-app/routes/editorial.tsx", "utf8").replace(/\s+/g, " ");
const featureRoute = readFileSync("router-app/routes/feature.tsx", "utf8");
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
  assert.match(submissionCopy.submitted, /submitted for review/);
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
  assert.match(editorialRoute, /<ArticleSectionBuilder sections=\{sections\} onChange=\{changeSections\}/);
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
  assert.match(moderationRoute, /PUBLISH FEATURE/);
});


test("submit existing editorial draft rpc moves saved drafts to review", () => {
  const submitMigration = readFileSync("supabase/migrations/202609120005_submit_editorial_draft.sql", "utf8");
  assert.match(submitMigration, /create or replace function public\.submit_editorial_draft\(target uuid\)/);
  assert.match(submitMigration, /lifecycle_status='submitted'/);
  assert.match(submitMigration, /Submitted for review/);
  assert.match(submitMigration, /doc\.author_id<>auth\.uid\(\) and not can_review/);
  assert.match(editorialRoute, /intent === "submit-existing"/);
  assert.match(editorialRoute, /intent === "submit" && !form\.has\("title"\)/);
  assert.match(editorialRoute, /if \(!item\) throw/);
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
  assert.match(editorialRoute, /<Form method="post" action="\/editorial" className="op-form" noValidate/);
  assert.match(editorialRoute, /name="title"/);
  assert.match(editorialRoute, /name="slug"/);
  assert.match(editorialRoute, /name="summary"/);
  assert.match(editorialRoute, /name="sections"/);
  assert.match(editorialRoute, /name="intent" value="save"/);
  assert.match(editorialRoute, /name="intent" value="submit"/);
  assert.match(editorialRoute, /rpc\("save_editorial_draft"/);
  assert.match(editorialRoute, /const response = routeActionData/);
  assert.equal(submissionCopy.saved, "Draft saved");
  assert.match(submissionCopy.submitted, /submitted for review/);
});


test("save editorial draft avoids ambiguous status references", () => {
  const statusFixMigration = readFileSync("supabase/migrations/202609130003_fix_save_editorial_draft_status_ambiguity.sql", "utf8");
  assert.match(statusFixMigration, /requested_status text:=coalesce/);
  assert.doesNotMatch(statusFixMigration, /doc jsonb;\n status text/);
  assert.match(statusFixMigration, /where i\.status='current'/);
  assert.match(statusFixMigration, /update public\.features f set/);
  assert.match(statusFixMigration, /coalesce\(nullif\(payload->>'image',''\),f\.image\)/);
  assert.match(statusFixMigration, /select \* into actor from public\.profiles p where p\.id=auth\.uid\(\)/);
});


test("save editorial draft avoids category and column local ambiguity", () => {
  const columnFixMigration = readFileSync("supabase/migrations/202609130004_fix_save_editorial_draft_column_ambiguity.sql", "utf8");
  assert.match(columnFixMigration, /v_category_id uuid/);
  assert.match(columnFixMigration, /category_id=v_category_id/);
  assert.match(columnFixMigration, /format_id=v_format_id/);
  assert.match(columnFixMigration, /where wd\.issue_id=v_issue_id/);
  assert.doesNotMatch(columnFixMigration, /declare[\s\S]* category_id uuid/);
  assert.doesNotMatch(columnFixMigration, /category_id=category_id/);
  assert.doesNotMatch(columnFixMigration, /format_id=format_id/);
  assert.doesNotMatch(columnFixMigration, /where issue_id=/);
});


test("temporary editorial trace is removed from production UI", () => {
  assert.doesNotMatch(editorialRoute, /TEMP EDITORIAL TRACE/);
  assert.doesNotMatch(editorialRoute, /debugTrace/);
});

test("image alt validation remains visible beside the field", () => {
  assert.ok(validateEditorialSubmission({title:"Test",slug:"test",summary:"Test summary",image:"/hero.png"},[]).some(issue=>issue.field==="imageAlt"));
  assert.match(editorialRoute, /attrs\("imageAlt"\)/);
  assert.match(editorialRoute, /errors\("imageAlt"\)/);
  assert.match(editorialRoute, /KOMA placeholder appears when no image is provided/);
});

test("shared review inbox is account-wide for authorised editorial reviewers", () => {
  assert.match(canonicalLifecycleMigration, /create or replace function public\.editorial_review_inbox\(\)/);
  assert.match(canonicalLifecycleMigration, /where public\.editorial_has_access\(auth\.uid\(\),false\)/);
  assert.match(canonicalLifecycleMigration, /ed\.lifecycle_status in \('submitted','changes_requested','approved'\)/);
  assert.match(canonicalLifecycleMigration, /left join public\.profiles p on p\.id=ed\.author_id/);
  assert.match(canonicalLifecycleMigration, /coalesce\(nullif\(p\.display_name,''\),'Panelist'\)/);
  const reviewInboxBody = canonicalLifecycleMigration.slice(canonicalLifecycleMigration.indexOf("create or replace function public.editorial_review_inbox"), canonicalLifecycleMigration.indexOf("create or replace function public.editorial_submitted_drafts"));
  assert.doesNotMatch(reviewInboxBody, /ed\.author_id\s*=\s*auth\.uid\(\)/);
  assert.doesNotMatch(reviewInboxBody, /author_id=auth\.uid\(\)/);
  assert.doesNotMatch(reviewInboxBody, /email/i);
  assert.doesNotMatch(reviewInboxBody, /aca99070|d57573e6|gareth/i);
  const reviewRpcLine = rawModerationRoute.split("\n").find((line) => line.includes('rpc("editorial_review_inbox")')) ?? "";
  assert.match(reviewRpcLine, /resolved\.client\.rpc\("editorial_review_inbox"\)/);
  assert.doesNotMatch(reviewRpcLine, /author_id|profile_id|user_id/);
  const reviewRowsBody = moderationRoute.slice(moderationRoute.indexOf("const reviewRows"), moderationRoute.indexOf("return (", moderationRoute.indexOf("const reviewRows")));
  assert.match(reviewRowsBody, /result\.review\.map/);
  assert.doesNotMatch(reviewRowsBody, /author_id|profile_id|user_id/);
  assert.match(moderationRoute, /capabilities\.editorial \|\| capabilities\.moderation/);
});

test("review inbox visibility model is editor A to editor B shared while drafts stay private", () => {
  const myWorkBody = canonicalLifecycleMigration.slice(canonicalLifecycleMigration.indexOf("create or replace function public.editorial_my_work"), canonicalLifecycleMigration.indexOf("create or replace function public.editorial_review_inbox"));
  const reviewInboxBody = canonicalLifecycleMigration.slice(canonicalLifecycleMigration.indexOf("create or replace function public.editorial_review_inbox"), canonicalLifecycleMigration.indexOf("create or replace function public.editorial_submitted_drafts"));
  assert.match(myWorkBody, /ed\.author_id=auth\.uid\(\)/, "editor A drafts are private to editor A in My Panels");
  assert.match(myWorkBody, /ed\.lifecycle_status in \('draft','submitted','changes_requested','approved'\)/);
  assert.doesNotMatch(reviewInboxBody, /ed\.author_id=auth\.uid\(\)/, "editor B can see editor A submitted panels through shared inbox");
  assert.match(reviewInboxBody, /public\.editorial_has_access\(auth\.uid\(\),false\)/, "editor B and admins pass editor-or-higher permission");
  assert.doesNotMatch(reviewInboxBody, /ed\.lifecycle_status in \('draft'/, "editor A drafts do not enter editor B shared review pool");
});

test("guided editorial form explains slug format and auto-suggest behaviour", () => {
  assert.match(editorialRoute, /The short URL name for this panel\. Use lowercase letters, numbers and hyphens\./);
  assert.match(editorialRoute, /Example: sucker-punch-doing-what-ubisoft-cant/);
  assert.match(editorialRoute, /const \[slugEdited, setSlugEdited\]/);
  assert.match(editorialRoute, /if \(field === "title" && !slugEdited && !current\.featureId\) next\.slug = slugify\(value\)/);
  assert.match(editorialRoute, /Use lowercase letters, numbers and hyphens/);
});

test("guided image fields explain alt text and show inline validation", () => {
  assert.match(editorialRoute, /Upload a feature image/);
  assert.match(editorialRoute, /Optional fallback\. Upload is preferred; the KOMA placeholder appears when no image is provided\./);
  assert.match(editorialRoute, /Required when you add an image\. Describe the image for readers using assistive technology\./);
  assert.match(editorialRoute, /errors\("imageAlt"\)/);
  assert.match(editorialRoute, /KOMA placeholder appears when no image is provided/);
});

test("save and submit guidance names private My Panels and shared Review Inbox", () => {
  assert.equal(submissionCopy.saved, "Draft saved");
  assert.match(submissionCopy.submitted, /submitted for review/);
  assert.match(editorialRoute, /Save keeps this private in MY PANELS\./);
  assert.match(editorialRoute, /Submit sends it to the shared Review Inbox for editors and moderators\./);
  assert.match(editorialRoute, /Drafts are private until submitted\./);
});

test("changes-requested guidance renders reviewer note and resubmit actions", () => {
  assert.match(editorialRoute, /Reviewer note:/);
  assert.match(editorialRoute, /Make your changes, then resubmit so editors can review the new version\./);
  assert.match(editorialRoute, /SAVE REVISION/);
  assert.match(editorialRoute, /RESUBMIT FOR REVIEW/);
});

test("human-readable panel directory statuses are contextual", () => {
  const helper = readFileSync("router-app/lib/editorial-alpha.ts", "utf8");
  assert.match(helper, /export function myPanelsStatusLabel/);
  assert.match(helper, /Private draft/);
  assert.match(helper, /In shared review/);
  assert.match(helper, /Needs revision/);
  assert.match(helper, /Ready for publication/);
  assert.match(helper, /export function reviewInboxStatusLabel/);
  assert.match(helper, /Awaiting review/);
  assert.match(helper, /Returned for revision/);
  assert.match(profileRoute, /myPanelsStatusLabel/);
  assert.match(editorialRoute, /myPanelsStatusLabel/);
  assert.match(moderationRoute, /reviewInboxStatusLabel/);
});

test("directory window and live preview shell render in normal UI", () => {
  const directory = readFileSync("router-app/components/PanelDirectory.tsx", "utf8");
  const css = readFileSync("router-app/app.css", "utf8");
  assert.match(directory, /panel-directory-window/);
  assert.match(directory, /directory window/);
  assert.match(css, /\.panel-directory-window/);
  assert.match(css, /max-height: min\(64vh, 620px\)/);
  assert.match(css, /position: sticky/);
  assert.match(editorialRoute, /LIVE PREVIEW/);
  assert.match(editorialRoute, /Start typing to build the panel preview\./);
  assert.match(editorialRoute, /editorial-preview-shell/);
  assert.doesNotMatch(editorialRoute, /TEMP EDITORIAL TRACE/);
});

test("moderation review preview uses a selected editorial review desk", () => {
  const css = readFileSync("router-app/app.css", "utf8");
  assert.match(moderationRoute, /REVIEW PREVIEW/);
  assert.match(moderationRoute, /Select a submitted panel to review\./);
  assert.match(moderationRoute, /selectedReviewId/);
  assert.match(moderationRoute, /selectedReview = result\.review\.find/);
  assert.match(moderationRoute, /review-preview-shell/);
  assert.match(moderationRoute, /review-preview-meta/);
  assert.match(moderationRoute, /review-article-frame/);
  assert.match(moderationRoute, /<ArticleRenderer document=\{selectedReview\.working_document as any\}/);
  assert.match(css, /\.review-preview-shell/);
  assert.match(css, /\.review-decision-desk/);
});

test("moderation decision controls separate review feedback from publish-ready approval", () => {
  assert.match(moderationRoute, /Reviewer note/);
  assert.match(moderationRoute, /minLength=\{4\}/);
  assert.match(moderationRoute, /REQUEST CHANGES/);
  assert.match(moderationRoute, /APPROVE AS PUBLISH-READY/);
  assert.match(moderationRoute, /Approval marks the panel publish-ready only; it does not publish it live\./);
  assert.match(moderationRoute, /Publishing to the live strip is next\. This panel is publish-ready\./);
  assert.match(moderationRoute, /PUBLISH FEATURE/);
});

test("phase 4b publish and takedown RPCs require moderator review access", () => {
  const publishingMigration = readFileSync("supabase/migrations/202609130005_editorial_publication_controls.sql", "utf8");
  assert.match(publishingMigration, /create or replace function public\.publish_editorial_panel\(target uuid\)/);
  assert.match(publishingMigration, /create or replace function public\.take_down_editorial_panel\(target uuid\)/);
  assert.match(publishingMigration, /not public\.editorial_has_access\(auth\.uid\(\),true\)/);
  assert.match(publishingMigration, /Only publish-ready panels can be published/);
  assert.match(publishingMigration, /Only published panels can be taken down/);
  assert.match(publishingMigration, /A published feature already uses this slug/);
});

test("phase 4b publish makes canonical documents public and takedown removes them", () => {
  const publishingMigration = readFileSync("supabase/migrations/202609130005_editorial_publication_controls.sql", "utf8");
  assert.match(publishingMigration, /doc\.lifecycle_status<>\'approved\'/);
  assert.match(publishingMigration, /status='published'/);
  assert.match(publishingMigration, /lifecycle_status='open_panel'/);
  assert.match(publishingMigration, /set lifecycle_status='published'/);
  assert.match(publishingMigration, /set lifecycle_status='taken_down'/);
  assert.match(publishingMigration, /status='archived',lifecycle_status='archived'/);
  assert.match(publishingMigration, /public_editorial_document\(feature_slug text\)/);
  assert.match(publishingMigration, /ed\.lifecycle_status='published'/);
});

test("phase 4b public catalogue includes published editorial panels and excludes taken-down panels", () => {
  const publicationServer = readFileSync("router-app/lib/publication.server.ts", "utf8");
  assert.match(publicationServer, /publicEditorialDocument/);
  assert.match(publicationServer, /public_editorial_document/);
  assert.match(publicationServer, /!\["draft", "taken_down"\]\.includes\(feature\.lifecycle_status\)/);
  assert.match(featureRoute, /publicEditorialDocument/);
  assert.match(featureRoute, /publishedDocument/);
  assert.match(featureRoute, /if \(!publishedDocument\) throw data/);
});

test("phase 4b moderation exposes publication controls without fake live publishing", () => {
  assert.match(moderationRoute, /editorial_publication_panels/);
  assert.match(moderationRoute, /PUBLISH FEATURE/);
  assert.match(moderationRoute, /TAKE DOWN/);
  assert.match(moderationRoute, /Feature published\./);
  assert.match(moderationRoute, /Feature taken down\./);
  assert.match(moderationRoute, /publish_editorial_panel/);
  assert.match(moderationRoute, /take_down_editorial_panel/);
  assert.match(moderationRoute, /APPROVE AS PUBLISH-READY/);
});

test("phase 4b placeholder image is applied when publishing without an image", () => {
  const publishingMigration = readFileSync("supabase/migrations/202609130005_editorial_publication_controls.sql", "utf8");
  assert.match(publishingMigration, /\/assets\/koma-feature-placeholder\.svg/);
  assert.match(publishingMigration, /KOMA:\/\/PLAY editorial placeholder/);
});

test("editorial administrator grants expose publish controls through shared capabilities", () => {
  const membership = readFileSync("router-app/lib/membership.server.ts", "utf8");
  assert.match(membership, /select\("id,access_level,revoked_at"\)/);
  assert.match(membership, /grantModeration = activeGrants\.some\(\(grant\) => grant\.access_level === "administrator"\)/);
  assert.match(membership, /moderation: roleModeration \|\| grantModeration/);
  assert.match(moderationRoute, /context\.capabilities\.moderation/);
  assert.match(moderationRoute, /PUBLISH FEATURE/);
  assert.match(moderationRoute, /No panels ready to publish\. Approve a submitted panel first\./);
});

test("phase 4b placeholder repair removes broken editorial SVG fallback", () => {
  const repair = readFileSync("supabase/migrations/202609130006_editorial_placeholder_asset_path.sql", "utf8");
  assert.match(repair, /where f\.image = '\/assets\/koma-vhs-v2\.svg'/);
  assert.match(repair, /v_image text := coalesce\(nullif\(payload->>'image',''\),'\/assets\/koma-feature-placeholder\.svg'\)/);
  assert.match(repair, /f\.image='\/assets\/koma-vhs-v2\.svg'/);
});

test("phase 4b placeholder repair normalizes current editorial documents", () => {
  const repair = readFileSync("supabase/migrations/202609130008_editorial_placeholder_document_paths.sql", "utf8");
  assert.match(repair, /update public\.editorial_documents ed/);
  assert.match(repair, /replace\(ed\.working_document::text,'\/assets\/koma-vhs-v2\.svg','\/assets\/koma-feature-placeholder\.svg'\)::jsonb/);
});

test("publish and takedown require explicit confirmation", () => {
  assert.match(moderationRoute, /useState<null \| \{\s*kind: "publish" \| "takeDown" \| "archive"/);
  assert.match(moderationRoute, /setConfirmation\(\{\s*kind: "publish"/);
  assert.match(moderationRoute, /setConfirmation\(\{\s*kind: "takeDown"/);
  assert.match(moderationRoute, /Publish this feature\? It will become visible on the public site and may appear in the current issue strip\./);
  assert.match(moderationRoute, /Take down this feature\? It will be removed from public feature pages and live issue listings, but its history will be kept\./);
  assert.match(moderationRoute, /Public URL: \/features\/\{confirmation\.slug\}/);
  assert.match(moderationRoute, /CONFIRM PUBLISH/);
  assert.match(moderationRoute, /CONFIRM TAKE DOWN/);
  assert.match(moderationRoute, /CANCEL/);
  assert.match(moderationRoute, /value=\{confirmation\.kind === "publish" \? "publishFeature" : confirmation\.kind === "archive" \? "archiveFeature" : confirmation\.kind === "closeIssue" \? "closeIssue" : "takeDownFeature"\}/);
});

test("publish and takedown server-side permission checks still apply", () => {
  assert.match(moderationRoute, /if \(intent === "publishFeature" \|\| intent === "takeDownFeature" \|\| intent === "archiveFeature" \|\| intent === "closeIssue"\)/);
  assert.match(moderationRoute, /!context\.capabilities\.moderation/);
  assert.match(moderationRoute, /Moderator access is required to publish, archive, close or take down panels\./);
  assert.match(moderationRoute, /publish_editorial_panel/);
  assert.match(moderationRoute, /take_down_editorial_panel/);
});

test("phase 4c archive controls are confirmation-gated and server checked", () => {
  const archiveMigration = readFileSync("supabase/migrations/202609130009_editorial_archive_controls.sql", "utf8");
  assert.match(archiveMigration, /create or replace function public\.archive_editorial_panel\(target uuid\)/);
  assert.match(archiveMigration, /doc\.lifecycle_status<>'published'/);
  assert.match(archiveMigration, /Only published panels can be archived/);
  assert.match(archiveMigration, /set lifecycle_status='archived'/);
  assert.match(archiveMigration, /Archived public panel/);
  assert.match(archiveMigration, /not public\.editorial_has_access\(auth\.uid\(\),true\)/);
  assert.match(moderationRoute, /ARCHIVE PANEL/);
  assert.match(moderationRoute, /Archive this panel\? It will leave the current issue spaces and move to the Archive\. Public archive access will remain available\./);
  assert.match(moderationRoute, /CONFIRM ARCHIVE/);
  assert.match(moderationRoute, /archive_editorial_panel/);
});

test("phase 4c archived panels remain public but leave current spaces", () => {
  const publicationServer = readFileSync("router-app/lib/publication.server.ts", "utf8");
  const homeRoute = readFileSync("router-app/routes/home.tsx", "utf8");
  const archiveRoute = readFileSync("router-app/routes/archive.tsx", "utf8");
  const featureRoute = readFileSync("router-app/routes/feature.tsx", "utf8");
  const archiveMigration = readFileSync("supabase/migrations/202609130009_editorial_archive_controls.sql", "utf8");
  assert.match(publicationServer, /!\["draft", "taken_down"\]\.includes\(feature\.lifecycle_status\)/);
  assert.match(homeRoute, /!\["archived", "taken_down"\]\.includes\(feature\.lifecycle_status\)/);
  assert.match(archiveRoute, /feature\.lifecycle_status === "archived"/);
  assert.match(archiveRoute, /No archived panels yet\./);
  assert.match(featureRoute, /ARCHIVED PANEL/);
  assert.match(featureRoute, /This panel is archived\. Public reading remains available/);
  assert.match(archiveMigration, /ed\.lifecycle_status in \('published','archived'\)/);
  assert.match(archiveMigration, /f\.lifecycle_status in \('open_panel','final_panel','archived'\)/);
});

test("phase 4c takedown works from archived state and hides public panels", () => {
  const archiveMigration = readFileSync("supabase/migrations/202609130009_editorial_archive_controls.sql", "utf8");
  assert.match(archiveMigration, /doc\.lifecycle_status not in \('published','archived'\)/);
  assert.match(archiveMigration, /lifecycle_status='taken_down'/);
  assert.match(archiveMigration, /ed\.lifecycle_status in \('approved','published','archived','taken_down'\)/);
});

test("phase 4d manual archive attaches panels to their calendar-month issue", () => {
  const issueClose = readFileSync("supabase/migrations/202609130010_issue_close_month_assignment.sql", "utf8");
  assert.match(issueClose, /create or replace function public\.issue_drop_for_month\(panel_date timestamptz\)/);
  assert.match(issueClose, /where i\.year=v_year and i\.month=v_month/);
  assert.match(issueClose, /on conflict\(year,month\)/);
  assert.match(issueClose, /panel_date := coalesce\(feature\.published_at,\(select min\(s\.created_at\)[\s\S]*feature\.created_at,feature\.archived_at,now\(\)\)/);
  assert.match(issueClose, /set issue_id=target_issue,[\s\S]*weekly_drop_id=target_drop,[\s\S]*lifecycle_status='archived'/);
});

test("phase 4d issue close includes live and already archived same-month panels", () => {
  const issueClose = readFileSync("supabase/migrations/202609130010_issue_close_month_assignment.sql", "utf8");
  assert.match(issueClose, /create or replace function public\.close_current_issue\(\)/);
  assert.match(issueClose, /coalesce\(ed\.lifecycle_status,f\.lifecycle_status\) in \('published','archived'\)/);
  assert.match(issueClose, /f\.issue_id=target_issue\.id/);
  assert.match(issueClose, /extract\(year from coalesce\(f\.published_at,f\.created_at,f\.archived_at\)/);
  assert.match(issueClose, /set issue_id=target_issue\.id/);
  assert.match(issueClose, /set status='archived'/);
  assert.match(issueClose, /Archived by issue close/);
});

test("phase 4d moderation exposes manual issue close preview and confirmation", () => {
  assert.match(moderationRoute, /issue_close_preview/);
  assert.match(moderationRoute, /CLOSE CURRENT ISSUE/);
  assert.match(moderationRoute, /Close the current issue\? Published panels from this issue will move to the Archive and leave live issue spaces\. Drafts, submitted panels and publish-ready panels will remain active\./);
  assert.match(moderationRoute, /CONFIRM CLOSE ISSUE/);
  assert.match(moderationRoute, /close_current_issue/);
  assert.match(moderationRoute, /Issue closed and archived\./);
});


test("phase 4d issue close repair avoids production-only feature created_at column", () => {
  const repair = readFileSync("supabase/migrations/202609130011_fix_issue_close_selection.sql", "utf8");
  assert.match(repair, /create or replace function public\.close_current_issue\(\)/);
  assert.match(repair, /create or replace function public\.issue_close_preview\(\)/);
  assert.doesNotMatch(repair, /feature\.created_at/);
  assert.doesNotMatch(repair, /f\.created_at/);
  assert.match(repair, /f\.updated_at/);
  assert.match(repair, /willCreateIssue/);
  assert.match(repair, /No published panels are ready to close for this issue\./);
});

test("phase 4d close selection can derive or create the month issue", () => {
  const repair = readFileSync("supabase/migrations/202609130011_fix_issue_close_selection.sql", "utf8");
  assert.match(repair, /where i\.status in \('current','finalising','published','open'\)/);
  assert.match(repair, /i\.year=target_year and i\.month=target_month/);
  assert.match(repair, /select i\.\* into target_issue from public\.issues i where i\.id=\(select x\.issue_id from public\.issue_drop_for_month\(current_panel_date\) x limit 1\) for update/);
  assert.match(repair, /coalesce\(ed\.lifecycle_status,f\.lifecycle_status\) in \('published','archived'\)/);
});


test("phase 4d issue close preview distinguishes editorial and static issue panels", () => {
  const staticMembership = readFileSync("supabase/migrations/202609130012_issue_close_static_membership.sql", "utf8");
  assert.match(staticMembership, /staticPanelCount/);
  assert.match(staticMembership, /editorialPanelCount/);
  assert.match(staticMembership, /includedPanelCount/);
  assert.match(moderationRoute, /total public panels will be included/);
  assert.match(moderationRoute, /editorial panels are ready to archive/);
  assert.match(moderationRoute, /static\/seeded panels are already part of this issue and will remain read-only/);
});

test("phase 4d close includes static panels without destructive lifecycle mutation", () => {
  const staticMembership = readFileSync("supabase/migrations/202609130012_issue_close_static_membership.sql", "utf8");
  assert.match(staticMembership, /ed\.feature_id is null/);
  assert.match(staticMembership, /lifecycle_status=case when m\.is_editorial then 'archived' else f\.lifecycle_status end/);
  assert.match(staticMembership, /archived_at=case when m\.is_editorial then coalesce\(f\.archived_at,now\(\)\) else f\.archived_at end/);
  assert.match(staticMembership, /update public\.editorial_documents ed[\s\S]*where ed\.feature_id in \(select id from issue_members where is_editorial\)/);
  assert.match(staticMembership, /update public\.issues i set status='archived'/);
});

test("phase 4d archive page prefers issue grouping over loose fallback", () => {
  const archiveRoute = readFileSync("router-app/routes/archive.tsx", "utf8");
  assert.match(archiveRoute, /<ArchiveShelf data=\{data\} issues=\{archiveIssues\(data, filters\)\} \/>/);
  assert.match(archiveRoute, /feature\.lifecycle_status === "archived" && !feature\.issue_id/);
  assert.match(archiveRoute, /Loose archived panels/);
  assert.match(archiveRoute, /No archived panels yet\./);
});


test("phase 4e writing toolbar inserts markdown around selections", () => {
  assert.equal(applyWritingTool("make this strong", 5, 9, "bold").value, "make **this** strong");
  assert.equal(applyWritingTool("make this lean", 5, 9, "italic").value, "make *this* lean");
  assert.equal(applyWritingTool("Opening", 0, 7, "heading").value, "## Opening");
  assert.equal(applyWritingTool("first\nsecond", 0, 12, "bullet").value, "- first\n- second");
  assert.equal(applyWritingTool("first", 0, 5, "numbered").value, "1. first");
  assert.equal(applyWritingTool("pull this", 0, 9, "quote").value, "> pull this");
  assert.equal(applyWritingTool("source", 0, 6, "link").value, "[source](https://example.com)");
  assert.equal(applyWritingTool("", 0, 0, "divider").value, "---");
});

test("phase 4e editorial preview parses basic markdown writing patterns", () => {
  const modules = bodyModules("## Opening\n\nParagraph with **bold**, *italic* and [source](https://example.com).\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted evidence\n\n---");
  assert.equal(modules[0].type, "heading");
  assert.equal(modules[1].type, "paragraph");
  assert.equal(modules[2].type, "unordered-list");
  assert.deepEqual(modules[2].content.items, ["one", "two"]);
  assert.equal(modules[3].type, "ordered-list");
  assert.deepEqual(modules[3].content.items, ["first", "second"]);
  assert.equal(modules[4].type, "pull-quote");
  assert.equal(modules[5].type, "divider");
});

test("phase 4e writing tools are shared by editorial and workshop contribution fields", () => {
  const toolbar = readFileSync("router-app/components/WritingToolbar.tsx", "utf8");
  const markdownText = readFileSync("router-app/components/MarkdownText.tsx", "utf8");
  const workshopClient = readFileSync("router-app/components/open-panel/WorkshopClient.tsx", "utf8");
  const articleRenderer = readFileSync("router-app/components/ArticleRenderer.tsx", "utf8");
  const publishedPanel = readFileSync("router-app/components/open-panel/PublishedPanel.tsx", "utf8");
  assert.match(toolbar, /role="toolbar"/);
  assert.match(toolbar, /Insert bold Markdown/);
  assert.match(readFileSync("router-app/components/ArticleSectionBuilder.tsx", "utf8"), /Paragraph writing tools/);
  assert.match(workshopClient, /Workshop contribution writing tools/);
  assert.match(articleRenderer, /<MarkdownText text=\{text\} \/>/);
  assert.match(publishedPanel, /<MarkdownText text=\{a\.body\} \/>/);
  assert.match(markdownText, /url\.protocol === "http:" \|\| url\.protocol === "https:"/);
  assert.doesNotMatch(markdownText, /dangerouslySetInnerHTML/);
});


test("phase 4f editorial image upload uses a strict private storage bucket", () => {
  const migration = readFileSync("supabase/migrations/202609140001_editorial_feature_image_upload.sql", "utf8");
  assert.match(migration, /editorial-feature-images/);
  assert.match(migration, /file_size_limit,allowed_mime_types/);
  assert.match(migration, /5242880/);
  assert.match(migration, /image\/png/);
  assert.match(migration, /image\/jpeg/);
  assert.match(migration, /image\/webp/);
  assert.match(migration, /public\.has_current_handbook_acceptance\(\)/);
  assert.match(migration, /public\.editorial_has_access\(auth\.uid\(\),false\)/);
  assert.match(migration, /\^editorial\/\[0-9a-f-\]\{36\}/);
});

test("phase 4f editorial image upload route validates auth type size and file contents", () => {
  const uploadRoute = readFileSync("router-app/routes/editorial-upload.tsx", "utf8");
  const imageRoute = readFileSync("router-app/routes/editorial-image.tsx", "utf8");
  const mediaServer = readFileSync("router-app/lib/editorial-media.server.ts", "utf8");
  const routes = readFileSync("router-app/routes.ts", "utf8");
  assert.match(routes, /member\/editorial\/upload/);
  assert.match(routes, /api\/editorial\/image/);
  assert.match(uploadRoute, /Sign in to upload editorial images/);
  assert.match(uploadRoute, /Editorial access is required/);
  assert.match(uploadRoute, /Images must be 5 MB or smaller\./);
  assert.match(uploadRoute, /Use PNG, JPEG or WebP\./);
  assert.match(mediaServer, /validateImageBytes/);
  assert.match(uploadRoute, /storage\s*\.from\(editorialImageBucket\)\s*\.upload/);
  assert.match(imageRoute, /createSignedUrl/);
  assert.doesNotMatch(uploadRoute + imageRoute + mediaServer, /service_role|SERVICE_ROLE/i);
});

test("phase 4f editorial composer upload populates image path and keeps placeholder fallback", () => {
  assert.match(editorialRoute, /Upload a feature image/);
  assert.match(editorialRoute, /PNG, JPEG or WebP\. 5 MB max\./);
  assert.match(editorialRoute, /fetch\("\/member\/editorial\/upload"/);
  assert.match(editorialRoute, /setImageMessage\("Image uploaded\."\)/);
  assert.match(editorialRoute, /payload\.url/);
  assert.match(editorialRoute, /className="editorial-image-preview"/);
  assert.match(editorialRoute, /errors\("imageAlt"\)/);
  const parsed = draftSchema.parse({ title: "Upload preview", slug: "upload-preview", summary: "A draft with uploaded media.", sections: "## Body\n\nThis draft has an uploaded image.", image: "/api/editorial/image?path=editorial/00000000-0000-0000-0000-000000000000/upload-preview/00000000-0000-0000-0000-000000000001.png", imageAlt: "Uploaded screenshot." });
  const doc = draftDocument(parsed);
  assert.equal(doc.header.hero?.src, parsed.image);
  assert.equal(doc.header.hero?.alt, "Uploaded screenshot.");
});
