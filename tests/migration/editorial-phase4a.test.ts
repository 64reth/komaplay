import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bodyModules, draftDocument, draftSchema } from "../../router-app/lib/editorial-alpha";

const migration = readFileSync("supabase/migrations/202609120001_editorial_alpha_rpc.sql", "utf8");
const profileRoute = readFileSync("router-app/routes/profile.tsx", "utf8");
const moderationRoute = readFileSync("router-app/routes/moderation.tsx", "utf8");

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
