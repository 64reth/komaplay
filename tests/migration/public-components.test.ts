import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
(globalThis as typeof globalThis & { React: typeof React }).React = React;
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ArticleRenderer } from "../../router-app/components/ArticleRenderer.tsx";
import { CommunityAdditions } from "../../router-app/components/open-panel/PublishedPanel.tsx";
import type { EditorialDocument } from "../../router-app/lib/document.ts";
import { moduleTypes } from "../../router-app/lib/document.ts";
import { meta as featureMeta } from "../../router-app/routes/feature.tsx";

const image = {
  id: "slide-one",
  src: "/assets/clue-shield.png",
  alt: "Original shield artwork",
  caption: "A caption",
  source: "KOMA://PLAY",
  rights: "Original development asset",
  citation: "[P//03]",
};

const contentByType: Record<string, Record<string, unknown>> = {
  heading: { text: "Section heading" },
  subheading: { text: "Section subheading" },
  paragraph: { text: "Paragraph copy" },
  "ordered-list": { items: ["First", "Second"] },
  "unordered-list": { items: ["Alpha", "Beta"] },
  "pull-quote": { text: "A pull quote" },
  callout: { title: "Callout", text: "Callout copy" },
  strategy: { title: "Hold meter", text: "Strategy copy" },
  image: image,
  gallery: { slides: [image, { ...image, id: "slide-two" }] },
  video: {
    url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Test video",
  },
  "video-text": {
    url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Test video with text",
    text: "Video context",
  },
  caption: { text: "Standalone caption" },
  source: { title: "Primary source", url: "https://example.com/source" },
  spoiler: { title: "Ending", text: "Spoiler copy" },
  "fact-box": {
    title: "Key facts",
    items: [{ label: "Platform", value: "Arcade" }],
  },
  related: { title: "A related panel", href: "/features/time" },
  divider: {},
  "negative-space": {},
  "closing-cta": {
    text: "Continue the revision",
    href: "#workshop-link",
    label: "ADD →",
  },
  comparison: {
    title: "Then and now",
    images: [image, { ...image, id: "slide-two" }],
  },
};

function render(document: EditorialDocument) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(ArticleRenderer, { document }),
    ),
  );
}

function documentWith(
  modules: EditorialDocument["modules"],
): EditorialDocument {
  return {
    schemaVersion: 1,
    header: {
      eyebrow: "GAMING · GUIDE",
      title: "Production title treatment",
      panelHeadline: "Panel headline",
      deck: "Deck copy",
      byline: "KOMA://PLAY Editorial",
      hero: image,
      heroCaption: "Hero caption",
    },
    modules,
  };
}

test("the shared renderer handles every declared module and preserves production title styling", () => {
  const modules = moduleTypes.map((type, index) => ({
    id: `module-${index}`,
    type,
    version: 1,
    presentation:
      type === "gallery" ? "carousel" : type === "image" ? "wide" : undefined,
    content: contentByType[type],
  }));
  const markup = render(documentWith(modules));
  assert.match(markup, /editorial-feature-header/);
  assert.match(markup, /Production title treatment/);
  assert.match(markup, /Standalone caption/);
  assert.match(markup, /editorial-comparison/);
  assert.match(markup, /LOAD VIDEO/);
  assert.doesNotMatch(markup, /<iframe/);
  assert.match(markup, /\[P\/\/03\]/);
});

test("gallery sequence, grid and carousel retain every slide in the no-JavaScript output", () => {
  for (const presentation of ["sequence", "grid", "carousel"]) {
    const markup = render(
      documentWith([
        {
          id: `gallery-${presentation}`,
          type: "gallery",
          version: 1,
          presentation,
          content: {
            slides: [
              image,
              { ...image, id: "slide-two", alt: "Second artwork" },
            ],
          },
        },
      ]),
    );
    assert.match(markup, /Original shield artwork/);
    assert.match(markup, /Second artwork/);
    assert.match(
      markup,
      new RegExp(`editorial-(?:gallery ${presentation}|carousel)`),
    );
  }
});

test("unknown modules fail safely without crashing the article", () => {
  const markup = render(
    documentWith([
      { id: "future-module", type: "future-panel", version: 1, content: {} },
    ]),
  );
  assert.match(markup, /module unavailable in this reader/);
});

test("published credits and Panel Citations expose only curated public provenance", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {},
      createElement(CommunityAdditions, {
        additions: [
          {
            id: "addition-one",
            contribution_id: "contribution-one",
            heading: "Hold meter",
            body: "A curated addition.",
            target_section: "Meter",
            contributor_id: "person-one",
            revision_number: 3,
            published_at: "2026-09-10T00:00:00Z",
            contributor: { id: "person-one", display_name: "Kai M." },
          },
        ],
        citations: [
          {
            id: "citation-one",
            contribution_id: "contribution-one",
            public_credit: "Kai M.",
            contribution_type: "Strategy",
            source_url: "https://example.com/evidence",
            submitted_at: "2026-09-08T00:00:00Z",
            reviewing_editor: "Panel editor",
            published_at: "2026-09-10T00:00:00Z",
            revision_number: 3,
            editorial_summary: "Clarified when to preserve meter.",
          },
        ],
      }),
    ),
  );
  assert.match(markup, /Kai M\./);
  assert.match(markup, /\[P\/\/03\]/);
  assert.match(markup, /Editorial change/);
  assert.doesNotMatch(markup, /email|moderation note|rejected draft/i);
});

test("feature metadata preserves the canonical production URL", () => {
  const records = featureMeta({
    loaderData: {
      feature: { slug: "tokon", title: "Tōkon", summary: "Guide summary" },
    },
  } as never);
  assert.deepEqual(records, [
    { title: "Tōkon — KOMA://PLAY" },
    { name: "description", content: "Guide summary" },
    {
      tagName: "link",
      rel: "canonical",
      href: "https://komaplay.com/features/tokon",
    },
  ]);
});
