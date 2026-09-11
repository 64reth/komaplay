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

test("homepage hero uses the accessible KOMA://PLAY brand treatment", async () => {
  const { CurrentIssueHeader } =
    await import("../components/publication/CurrentIssueHeader");
  const { developmentCatalogue } = await import("../data/publication-demo");
  const data = developmentCatalogue();
  const html = renderToStaticMarkup(
    <CurrentIssueHeader issue={data.issues[0]} categories={data.categories} />,
  );
  assert.match(html, /aria-label="KOMA:\/\/PLAY"/);
  assert.doesNotMatch(html, /INK\/\/:PLAY/);
});
test("Workshop header keeps one ordered return action and no sign-out control", async () => {
  const { WorkshopHeader } =
    await import("../components/open-panel/WorkshopHeader");
  const { developmentCatalogue } = await import("../data/publication-demo");
  const data = developmentCatalogue();
  const html = renderToStaticMarkup(
    <WorkshopHeader
      feature={data.features[2]}
      issue={data.issues[0]}
      now={data.now}
      open
      role="admin"
    />,
  );
  assert.match(html, /← RETURN TO COMMUNITY EDITION/);
  assert.match(html, /OPEN PANEL WORKSHOP/);
  assert.match(html, /MEMBER UTILITIES/);
  assert.match(html, /MODERATION/);
  assert.doesNotMatch(html, /SIGN OUT/);
});
test("Editorial Dashboard exposes profile and publication escape navigation", async () => {
  const { FeatureComposer } =
    await import("../components/editorial/FeatureComposer");
  const { tokonGuide } = await import("../data/tokon-guide");
  const html = renderToStaticMarkup(<FeatureComposer initial={tokonGuide} />);
  assert.match(html, /← RETURN TO PROFILE/);
  assert.match(html, /VIEW PUBLICATION/);
  assert.match(html, /VIEW COMMUNITY EDITION/);
  assert.match(html, /OPEN WORKSHOP/);
});

test("homepage and Community Edition resolve the single canonical KOMA VHS asset", async () => {
  const { developmentCatalogue } = await import("../data/publication-demo");
  const { stripItems } = await import("../lib/publication/domain");
  const { KOMA_VHS_ASSET, resolvePublicMediaPath } =
    await import("../lib/publication/media");
  const data = developmentCatalogue();
  const feature = data.features.find((item) => item.slug === "afterimage")!;
  const strip = stripItems(data, data.drops[0]).find(
    (item) => item.id === "afterimage",
  )!;
  assert.equal(feature.image, KOMA_VHS_ASSET);
  assert.equal(strip.image, KOMA_VHS_ASSET);
  assert.equal(resolvePublicMediaPath("/assets/clue-vhs.png"), KOMA_VHS_ASSET);
  assert.equal(resolvePublicMediaPath("/assets/koma-vhs.png"), KOMA_VHS_ASSET);
});

test("red accent language uses semantic tokens and reusable interaction classes", async () => {
  const css = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  );
  assert.match(css, /--color-accent: #ef3027/);
  assert.match(css, /--color-accent-text: #9e2a24/);
  assert.match(css, /\.editorial-marker/);
  assert.match(css, /\.active-underline/);
  assert.match(css, /\.action-primary/);
  assert.match(css, /prefers-reduced-motion/);
});

test("editorial capability requires an active administrator or active editorial grant", async () => {
  const { hasEditorialCapability } = await import("../lib/editorial/access");
  const activeEditor = [{ access_level: "editor", revoked_at: null }];
  assert.equal(
    hasEditorialCapability({ role: "admin", account_status: "active" }, []),
    true,
  );
  assert.equal(
    hasEditorialCapability(
      { role: "member", account_status: "active" },
      activeEditor,
    ),
    true,
  );
  assert.equal(
    hasEditorialCapability({ role: "member", account_status: "active" }, [
      { access_level: "editor", revoked_at: "2026-09-01" },
    ]),
    false,
  );
  assert.equal(
    hasEditorialCapability(
      { role: "member", account_status: "restricted" },
      activeEditor,
    ),
    false,
  );
});

test("profile account routes mount shared masthead and escape navigation", async () => {
  const fs = await import("node:fs/promises");
  const [profile, settings] = await Promise.all([
    fs.readFile(new URL("../app/profile/page.tsx", import.meta.url), "utf8"),
    fs.readFile(
      new URL("../app/profile/settings/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(profile, /<EditorialHeader/);
  assert.match(profile, /RETURN TO PUBLICATION/);
  assert.match(profile, /EDITORIAL DASHBOARD/);
  assert.match(settings, /<EditorialHeader/);
  assert.match(settings, /RETURN TO PROFILE/);
  assert.match(settings, /RETURN TO PUBLICATION/);
});
