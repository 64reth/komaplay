import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleRenderer } from "../components/editorial/ArticleRenderer";
import { tokonGuide } from "../data/tokon-guide";
import {
  blankModule,
  editorialDocumentSchema,
} from "../lib/editorial/document";
import { imageError, mediaLimits, trustedVideo } from "../lib/editorial/media";
test("shared renderer includes production header, gallery carousel, and slide citation", () => {
  const html = renderToStaticMarkup(<ArticleRenderer document={tokonGuide} />);
  assert.match(html, /Tōkon: What the First Ten Hours/);
  assert.match(html, /aria-roledescription="carousel"/);
  assert.match(html, /\[P\/\/03\]/);
});
test("module IDs are stable and publication validation catches missing accessibility and rights", () => {
  const image = blankModule("image");
  assert.ok(image.id.startsWith("image-"));
  const result = editorialDocumentSchema.safeParse({
    ...tokonGuide,
    modules: [image],
  });
  assert.equal(result.success, false);
});
test("gallery presentation does not alter slide content and rejects more than twelve slides", () => {
  const gallery = tokonGuide.modules.find((x) => x.type === "gallery")!;
  const slides = gallery.content.slides as unknown[];
  assert.equal(slides.length, 3);
  const invalid = {
    ...tokonGuide,
    modules: [
      {
        ...gallery,
        content: {
          slides: Array.from({ length: 13 }, (_, i) => ({
            id: `s${i}`,
            src: "/x.png",
            alt: "x",
            rights: "owned",
          })),
        },
      },
    ],
  };
  assert.equal(editorialDocumentSchema.safeParse(invalid).success, false);
});
test("media limits and provider allowlist reject unsafe inputs", () => {
  assert.equal(mediaLimits.gallery.maxImages, 12);
  assert.match(
    imageError({ size: 11 * 1024 * 1024, type: "image/jpeg" }, "gallery") ?? "",
    /larger/,
  );
  assert.match(
    imageError({ size: 1, type: "image/svg+xml" }) ?? "",
    /unsupported/,
  );
  assert.equal(trustedVideo("https://youtube.com.evil.test/x"), null);
  assert.equal(
    trustedVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.provider,
    "youtube",
  );
});
