import { z } from "zod";
import { trustedVideo } from "./media";
import type { EditorialDocument, ArticleModule } from "./document";

export const draftSchema = z.object({
  featureId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(4).max(150),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens."),
  summary: z.string().trim().min(8).max(1000),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  image: z.string().trim().max(2000).optional().default(""),
  imageAlt: z.string().trim().max(400).optional().default(""),
  sections: z.string().trim().min(20).max(20000),
  videoUrl: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["draft", "submitted"]).default("draft"),
});

export function bodyModules(sections: string, videoUrl = ""): ArticleModule[] {
  const modules: ArticleModule[] = sections.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part, index) => {
    if (part.startsWith("## ")) return { id: "section-" + (index + 1), type: "heading", version: 1, content: { text: part.slice(3).trim() } };
    return { id: "paragraph-" + (index + 1), type: "paragraph", version: 1, content: { text: part } };
  });
  if (videoUrl) {
    if (!trustedVideo(videoUrl)) throw new Error("Use a supported YouTube or Twitch URL.");
    modules.push({ id: "video-1", type: "video", version: 1, content: { url: videoUrl, title: "Editorial video" } });
  }
  return modules;
}

export function draftDocument(input: z.infer<typeof draftSchema>): EditorialDocument {
  const modules = bodyModules(input.sections, input.videoUrl);
  if (input.image) modules.unshift({ id: "lead-image", type: "image", version: 1, presentation: "wide", content: { src: input.image, alt: input.imageAlt, caption: "Editorial reference image", source: "Editorial dashboard", rights: "Documented by editor" } });
  return { schemaVersion: 1, header: { eyebrow: "COMMUNITY EDITION", title: input.title, panelHeadline: input.title.slice(0, 90), standfirst: input.summary, byline: "KOMA://PLAY Editorial" }, modules };
}

export function documentBodyText(sections: string) {
  return sections.trim();
}


export type EditorialWorkItem = {
  feature_id: string;
  title: string;
  slug: string;
  summary: string;
  lifecycle_status: string;
  updated_at: string;
  working_document: EditorialDocument;
  category_id?: string | null;
  image?: string | null;
  image_alt?: string | null;
  reviewer_note?: string | null;
};

export function composerFromWorkItem(item: EditorialWorkItem): z.infer<typeof draftSchema> {
  const modules = Array.isArray(item.working_document?.modules) ? item.working_document.modules : [];
  const imageModule = modules.find((module) => module.type === "image");
  const videoModule = modules.find((module) => module.type === "video" || module.type === "video-text");
  const sections = modules
    .filter((module) => module.type === "heading" || module.type === "paragraph")
    .map((module) => {
      const text = String(module.content?.text ?? "").trim();
      return module.type === "heading" ? `## ${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n");
  return {
    featureId: item.feature_id,
    title: item.working_document?.header?.title || item.title,
    slug: item.slug,
    summary: item.working_document?.header?.standfirst || item.summary,
    categoryId: item.category_id ?? "",
    image: String(imageModule?.content?.src ?? item.image ?? ""),
    imageAlt: String(imageModule?.content?.alt ?? item.image_alt ?? ""),
    sections: sections || "## Opening read\n\nContinue writing this panel.",
    videoUrl: String(videoModule?.content?.url ?? ""),
    status: item.lifecycle_status === "submitted" ? "submitted" : "draft",
  };
}

export function editorialStatusLabel(status: string) {
  if (status === "submitted") return "Submitted for review";
  if (status === "changes_requested") return "Changes requested";
  if (status === "approved") return "Publish-ready";
  if (status === "published") return "Published";
  return "Draft";
}
