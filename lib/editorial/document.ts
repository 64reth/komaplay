import { z } from "zod";
import { mediaLimits, trustedVideo } from "./media";
const id = z.string().min(3).max(100);
const text = z.string().trim().max(10000);
export const moduleTypes = [
  "heading",
  "subheading",
  "paragraph",
  "ordered-list",
  "unordered-list",
  "pull-quote",
  "callout",
  "image",
  "gallery",
  "video",
  "video-text",
  "caption",
  "source",
  "spoiler",
  "fact-box",
  "strategy",
  "related",
  "divider",
  "negative-space",
  "closing-cta",
  "comparison",
] as const;
export type ModuleType = (typeof moduleTypes)[number];
export type GalleryPresentation = "sequence" | "grid" | "carousel";
export type GallerySlide = {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  source?: string;
  rights?: string;
  focalPoint?: string;
  citation?: string;
};
export type ArticleModule = {
  id: string;
  type: ModuleType | string;
  version: number;
  content: Record<string, unknown>;
  presentation?: string;
};
export type EditorialDocument = {
  schemaVersion: number;
  header: {
    eyebrow: string;
    title: string;
    panelHeadline: string;
    deck?: string;
    standfirst?: string;
    byline: string;
    hero?: GallerySlide;
    heroCaption?: string;
  };
  modules: ArticleModule[];
};
const slide = z.object({
  id,
  src: z.string().min(1),
  alt: text.min(1).max(400),
  caption: text.optional(),
  source: text.optional(),
  rights: text.optional(),
  focalPoint: text.optional(),
  citation: text.optional(),
});
const moduleSchema = z.object({
  id,
  type: z.string().min(1),
  version: z.number().int().positive().default(1),
  content: z.record(z.string(), z.unknown()),
  presentation: z.string().optional(),
});
export const editorialDocumentSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    header: z.object({
      eyebrow: text.max(80),
      title: text.min(4).max(150),
      panelHeadline: text.min(4).max(90),
      deck: text.max(300).optional(),
      standfirst: text.max(1000).optional(),
      byline: text.min(1).max(120),
      hero: slide.optional(),
      heroCaption: text.optional(),
    }),
    modules: z.array(moduleSchema).max(120),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    doc.modules.forEach((m, index) => {
      if (ids.has(m.id))
        ctx.addIssue({
          code: "custom",
          message: "Module IDs must be stable and unique",
          path: ["modules", index, "id"],
        });
      ids.add(m.id);
      if (m.type === "gallery") {
        const slides = (m.content.slides as GallerySlide[] | undefined) ?? [];
        if (slides.length > mediaLimits.gallery.maxImages)
          ctx.addIssue({
            code: "custom",
            message: "This gallery already contains 12 images",
            path: ["modules", index],
          });
        slides.forEach((s, i) => {
          if (!s.alt?.trim())
            ctx.addIssue({
              code: "custom",
              message: "Gallery images need alt text",
              path: ["modules", index, "slides", i],
            });
          if (!s.rights?.trim())
            ctx.addIssue({
              code: "custom",
              message: "Gallery images need rights information",
              path: ["modules", index, "slides", i],
            });
        });
      }
      if (m.type === "image") {
        if (!String(m.content.alt ?? "").trim())
          ctx.addIssue({
            code: "custom",
            message: "Image needs alt text",
            path: ["modules", index],
          });
        if (!String(m.content.rights ?? "").trim())
          ctx.addIssue({
            code: "custom",
            message: "Image needs rights information",
            path: ["modules", index],
          });
      }
      if (
        ["video", "video-text"].includes(m.type) &&
        !trustedVideo(String(m.content.url ?? ""))
      )
        ctx.addIssue({
          code: "custom",
          message: "Use a supported YouTube or Twitch URL",
          path: ["modules", index],
        });
    });
  });
export function makeId(type = "module") {
  return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}
export function blankModule(type: ModuleType): ArticleModule {
  const id = makeId(type);
  if (type === "paragraph")
    return { id, type, version: 1, content: { text: "Start writing here." } };
  if (type === "heading")
    return { id, type, version: 1, content: { text: "New section" } };
  if (type === "gallery")
    return {
      id,
      type,
      version: 1,
      presentation: "sequence",
      content: { slides: [] },
    };
  if (type === "image")
    return {
      id,
      type,
      version: 1,
      presentation: "inline",
      content: {
        src: "/assets/clue-shield.png",
        alt: "",
        caption: "",
        source: "",
        rights: "",
      },
    };
  if (type === "video" || type === "video-text")
    return {
      id,
      type,
      version: 1,
      content: {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Video",
        text: "",
      },
    };
  return { id, type, version: 1, content: { text: "" } };
}
export function documentIssues(doc: EditorialDocument) {
  const result = editorialDocumentSchema.safeParse(doc);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}
