import React from "react";
Object.assign(globalThis, { React });
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleRenderer } from "../../router-app/components/ArticleRenderer";
import { ArticleSectionBuilder, sectionLabels } from "../../router-app/components/ArticleSectionBuilder";
import { composerSectionTypes, createComposerSection, moveComposerSection, removeComposerSection, updateComposerSection, parseComposerSections, serializeComposerSections, composerFromWorkItem, draftDocument, draftSchema, validateComposerSections, legacyBodyToComposerSections, type ComposerSection, type EditorialWorkItem } from "../../router-app/lib/editorial-alpha";

const input = { title: "Modular alpha", slug: "modular-alpha", summary: "An ordered article for readers.", image: "/hero.png", imageAlt: "Hero artwork" };
const sample: ComposerSection[] = [
  { id: "heading-1", type: "heading", text: "Opening heading" },
  { id: "paragraph-1", type: "paragraph", text: "First paragraph." },
  { id: "image-1", type: "image", url: "/body.png", alt: "Body image" },
  { id: "paragraph-2", type: "paragraph", text: "Second paragraph." },
  { id: "quote-1", type: "quote", text: "Quoted words.", attribution: "An editor" },
  { id: "video-1", type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { id: "divider-1", type: "divider" },
];
function reopen(document: ReturnType<typeof draftDocument>) {
  return composerFromWorkItem({ feature_id: "00000000-0000-4000-8000-000000000001", ...input, lifecycle_status: "draft", updated_at: "2026-09-14", working_document: JSON.parse(JSON.stringify(document)) } as EditorialWorkItem);
}
for (const type of composerSectionTypes) test(`add ${type} with editable fields and clear label`, () => {
  const section = createComposerSection(type);
  assert.equal(section.type, type);
  const html = renderToStaticMarkup(<ArticleSectionBuilder sections={[section]} onChange={() => {}} upload={() => {}} />);
  assert.ok(html.includes(sectionLabels[type]));
  assert.match(html, /ADD SECTION/);
  assert.match(html, /Move section 1 up/);
  assert.match(html, /Remove section 1/);
  assert.equal(validateComposerSections([section], true).length === 0, type === "divider");
});
test("move up/down preserves identity and refuses out-of-bounds moves; remove targets one section", () => {
  const moved = moveComposerSection(sample, "image-1", "up");
  assert.deepEqual(moved.map(s => s.id), ["heading-1", "image-1", "paragraph-1", "paragraph-2", "quote-1", "video-1", "divider-1"]);
  assert.deepEqual(moveComposerSection(moved, "image-1", "down"), sample);
  assert.equal(moveComposerSection(sample, "heading-1", "up"), sample);
  assert.equal(moveComposerSection(sample, "divider-1", "down"), sample);
  assert.equal(removeComposerSection(sample, "image-1").length, 6);
  assert.equal(sample.length, 7);
  assert.equal(updateComposerSection(sample, "paragraph-1", { text: "Edited" })[1].text, "Edited");
});
for (const status of ["draft", "submitted"] as const) test(`${status} document JSON preserves order through save and reopen`, () => {
  const value = draftSchema.parse({ ...input, status, sectionsJson: serializeComposerSections(sample) });
  assert.deepEqual(validateComposerSections(parseComposerSections(value.sectionsJson), status === "submitted"), []);
  const doc = draftDocument(value);
  assert.deepEqual(doc.modules.map(m => m.id), sample.map(s => s.id));
  const restored = reopen(doc);
  assert.deepEqual(parseComposerSections(restored.sectionsJson).map(s => s.id), sample.map(s => s.id));
  assert.deepEqual(draftDocument(restored).modules, doc.modules);
  assert.equal(restored.image, "/hero.png");
  assert.equal(parseComposerSections(restored.sectionsJson)[4].attribution, "An editor");
});
test("shared preview renders custom order, one hero, attribution and escaped content", () => {
  const doc = draftDocument(draftSchema.parse({ ...input, sectionsJson: serializeComposerSections(sample) }));
  const html = renderToStaticMarkup(<ArticleRenderer document={doc} />);
  const markers = ["Opening heading", "First paragraph", "Body image", "Second paragraph", "Quoted words", "editorial-video", "editorial-divider"];
  for (let i = 1; i < markers.length; i++) assert.ok(html.indexOf(markers[i]) > html.indexOf(markers[i - 1]), markers[i]);
  assert.equal((html.match(/src="\/hero.png"/g) ?? []).length, 1);
  assert.match(html, /An editor/);
  doc.modules[1].content.text = "<script>alert(1)</script>";
  assert.doesNotMatch(renderToStaticMarkup(<ArticleRenderer document={doc} />), /<script>/);
});
test("incomplete draft sections including an entirely empty body survive reopening", () => {
  const sections = composerSectionTypes.map(type => createComposerSection(type));
  assert.deepEqual(validateComposerSections(sections), []);
  assert.ok(validateComposerSections(sections, true).length > 0);
  const doc = draftDocument(draftSchema.parse({ ...input, sectionsJson: serializeComposerSections(sections) }));
  assert.deepEqual(parseComposerSections(reopen(doc).sectionsJson).map(s => s.id), sections.map(s => s.id));
  const empty = draftDocument(draftSchema.parse({ ...input, sectionsJson: "[]" }));
  assert.deepEqual(parseComposerSections(reopen(empty).sectionsJson), []);
  assert.ok(validateComposerSections([], true).length);
});
test("image alt text and trusted video are required before submit", () => {
  assert.match(validateComposerSections([{ id: "image", type: "image", url: "/body.png", alt: " " }], true).join(), /screen readers/);
  for (const url of ["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=abcdefghi", "https://vimeo.com/123", ""]) assert.ok(validateComposerSections([{ id: "video", type: "video", url }], true).length);
  for (const url of ["https://youtu.be/dQw4w9WgXcQ", "https://www.twitch.tv/videos/123456"]) assert.deepEqual(validateComposerSections([{ id: "video", type: "video", url }], true), []);
});
test("old single body becomes one paragraph without splitting or losing text", () => {
  const text = "Opening paragraph.\n\nSecond paragraph.";
  assert.deepEqual(legacyBodyToComposerSections(text).map(s => [s.type, s.text]), [["paragraph", text]]);
  const value = draftSchema.parse({ ...input, sections: text, sectionsJson: serializeComposerSections(legacyBodyToComposerSections(text)) });
  assert.equal(draftDocument(value).modules[0].content.text, text);
});
test("legacy advanced modules remain intact, malformed JSON cannot silently discard content", () => {
  const doc = draftDocument(draftSchema.parse({ ...input, sectionsJson: "[]" }));
  doc.modules = [{ id: "gallery-1", type: "gallery", version: 1, content: { slides: [] }, presentation: "grid" }];
  assert.deepEqual(draftDocument(reopen(doc)).modules, doc.modules);
  assert.throws(() => parseComposerSections("broken"));
  assert.throws(() => parseComposerSections('[{"id":"x","type":"raw-html"}]'));
  assert.throws(() => parseComposerSections(JSON.stringify([sample[0], sample[0]])));
});
