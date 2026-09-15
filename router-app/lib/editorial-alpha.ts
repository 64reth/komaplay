import { z } from "zod";
import { trustedVideo } from "./media";
import type { EditorialDocument, ArticleModule } from "./document";
import { KOMA_FEATURE_PLACEHOLDER, KOMA_FEATURE_PLACEHOLDER_ALT } from "./publication-media";

export const composerSectionTypes = ["paragraph", "heading", "image", "quote", "bullet-list", "numbered-list", "video", "divider"] as const;
export type ComposerSectionType = (typeof composerSectionTypes)[number];
export type ComposerSection = {
  id: string;
  type: ComposerSectionType | "legacy";
  module?: ArticleModule;
  text?: string;
  url?: string;
  alt?: string;
  attribution?: string;
};

export const draftSchema = z.object({
  featureId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(4).max(150),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens."),
  summary: z.string().trim().min(8).max(1000),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  image: z.string().trim().max(2000).optional().default(""),
  imageAlt: z.string().trim().max(400).optional().default(""),
  sections: z.string().trim().max(60000).default(""),
  sectionsJson: z.string().trim().max(60000).optional().default(""),
  videoUrl: z.string().trim().max(2000).optional().default(""),
  status: z.enum(["draft", "submitted", "changes_requested", "publish_ready", "published", "archived", "taken_down"]).default("draft"),
});

export function createComposerSection(type: ComposerSectionType, index = Date.now()): ComposerSection {
  const id = `${type}-${index}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === "paragraph") return { id, type, text: "" };
  if (type === "heading") return { id, type, text: "" };
  if (type === "image") return { id, type, url: "", alt: "", text: "" };
  if (type === "quote") return { id, type, text: "", attribution: "" };
  if (type === "bullet-list" || type === "numbered-list") return { id, type, text: "" };
  if (type === "video") return { id, type, url: "" };
  return { id, type };
}

export function moveComposerSection(sections: ComposerSection[], id: string, direction: "up" | "down") {
  const index = sections.findIndex((section) => section.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= sections.length) return sections;
  const next = [...sections];
  const [section] = next.splice(index, 1);
  next.splice(target, 0, section);
  return next;
}

export function removeComposerSection(sections: ComposerSection[], id: string) {
  return sections.filter((section) => section.id !== id);
}

export function updateComposerSection(sections: ComposerSection[], id: string, patch: Partial<ComposerSection>) {
  return sections.map((section) => (section.id === id ? { ...section, ...patch, id: section.id, type: section.type } : section));
}

export function bodyModules(sections: string, videoUrl = ""): ArticleModule[] {
  const modules: ArticleModule[] = sections.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part, index) => {
    if (part === "---") return { id: "divider-" + (index + 1), type: "divider", version: 1, content: {} };
    if (part.startsWith("## ")) return { id: "section-" + (index + 1), type: "heading", version: 1, content: { text: part.slice(3).trim() } };
    if (/^(?:- |\* )/m.test(part)) return { id: "list-" + (index + 1), type: "unordered-list", version: 1, content: { items: part.split("\n").map((line) => line.replace(/^(?:- |\* )/, "").trim()).filter(Boolean) } };
    if (/^\d+\. /m.test(part)) return { id: "ordered-list-" + (index + 1), type: "ordered-list", version: 1, content: { items: part.split("\n").map((line) => line.replace(/^\d+\. /, "").trim()).filter(Boolean) } };
    if (part.startsWith("> ")) return { id: "quote-" + (index + 1), type: "pull-quote", version: 1, content: { text: part.split("\n").map((line) => line.replace(/^> ?/, "")).join("\n").trim() } };
    return { id: "paragraph-" + (index + 1), type: "paragraph", version: 1, content: { text: part } };
  });
  if (videoUrl) {
    if (!trustedVideo(videoUrl)) throw new Error("Use a supported YouTube or Twitch URL.");
    modules.push({ id: "video-1", type: "video", version: 1, content: { url: videoUrl, title: "Editorial video" } });
  }
  return modules;
}

export function legacyBodyToComposerSections(sections: string, videoUrl = ""): ComposerSection[] {
  const converted: ComposerSection[] = sections ? [{ id: "legacy-paragraph-1", type: "paragraph", text: sections }] : [];
  if (videoUrl) converted.push({ id: "legacy-video-1", type: "video", url: videoUrl });
  return converted;
}

const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([...composerSectionTypes, "legacy"]),
  text: z.string().max(20000).optional(),
  url: z.string().max(2000).optional(),
  alt: z.string().max(400).optional(),
  attribution: z.string().max(400).optional(),
  module: z.object({ id: z.string(), type: z.string(), version: z.number(), content: z.record(z.unknown()), presentation: z.string().optional() }).optional(),
});
export function parseComposerSections(sectionsJson = "", fallbackSections = "", videoUrl = ""): ComposerSection[] {
  if (!sectionsJson) return legacyBodyToComposerSections(fallbackSections, videoUrl);
  const sections = z.array(sectionSchema).max(120).parse(JSON.parse(sectionsJson));
  if (new Set(sections.map(s => s.id)).size !== sections.length) throw new Error("Section IDs must be unique.");
  if (sections.some(s => s.type === "legacy" && !s.module)) throw new Error("Existing section content is missing.");
  return sections;
}

export function serializeComposerSections(sections: ComposerSection[]) {
  return JSON.stringify(sections.map((section) => ({
    module: section.module,
    id: section.id,
    type: section.type,
    text: section.text ?? "",
    url: section.url ?? "",
    alt: section.alt ?? "",
    attribution: section.attribution ?? "",
  })));
}

export function composerSectionsToText(sections: ComposerSection[]) {
  return sections.map((section) => {
    if (section.type === "heading") return section.text?.trim() ? `## ${section.text.trim()}` : "";
    if (section.type === "bullet-list") return (section.text ?? "").split("\n").map((item) => item.trim()).filter(Boolean).map((item) => `- ${item.replace(/^(?:- |\* )/, "")}`).join("\n");
    if (section.type === "numbered-list") return (section.text ?? "").split("\n").map((item) => item.trim()).filter(Boolean).map((item, index) => `${index + 1}. ${item.replace(/^\d+\. /, "")}`).join("\n");
    if (section.type === "quote") return (section.text ?? "").split("\n").map((line) => `> ${line.replace(/^> ?/, "")}`).join("\n");
    if (section.type === "image") return [section.url, section.alt].filter(Boolean).join("\n");
    if (section.type === "video") return section.url ?? "";
    if (section.type === "divider") return "---";
    return section.text ?? "";
  }).filter((part) => part.trim()).join("\n\n");
}

export function composerSectionsToModules(sections: ComposerSection[]): ArticleModule[] {
  return sections.flatMap((section, index): ArticleModule[] => {
    const id = section.id || `${section.type}-${index + 1}`;
    const text = (section.text ?? "").trim();
    if (section.type === "legacy" && section.module) return [section.module];
    if (section.type === "paragraph") return [{ id, type: "paragraph", version: 1, content: { text } }];
    if (section.type === "heading") return [{ id, type: "heading", version: 1, content: { text } }];
    if (section.type === "image") {
      const src = (section.url ?? "").trim();
      return [{ id, type: "image", version: 1, presentation: "wide", content: { src, alt: section.alt ?? "", caption: text, source: "Editorial dashboard", rights: "Documented by editor" } }];
    }
    if (section.type === "quote") {
      return [{ id, type: "pull-quote", version: 1, content: { text, attribution: section.attribution ?? "" } }];
    }
    if (section.type === "bullet-list" || section.type === "numbered-list") {
      const items = (section.text ?? "").split("\n").map((item) => item.replace(/^(?:- |\* |\d+\. )/, "").trim()).filter(Boolean);
      return [{ id, type: section.type === "bullet-list" ? "unordered-list" : "ordered-list", version: 1, content: { items } }];
    }
    if (section.type === "video") {
      const url = (section.url ?? "").trim();
      return [{ id, type: "video", version: 1, content: { url, title: "Editorial video" } }];
    }
    if (section.type === "divider") return [{ id, type: "divider", version: 1, content: {} }];
    return [];
  });
}

export function validateComposerSections(sections: ComposerSection[], strict = false) {
  const errors: string[] = [];
  if (strict && !sections.length) errors.push("Add at least one article section before submitting.");
  sections.forEach((section, index) => {
    const label = `${section.type.replace("-", " ")} section ${index + 1}`;
    if (!strict) return;
    if (["paragraph", "heading", "quote", "bullet-list", "numbered-list"].includes(section.type) && !(section.text ?? "").trim()) errors.push(`${label} is empty.`);
    if (section.type === "bullet-list" || section.type === "numbered-list") {
      if (!(section.text ?? "").split("\n").some(item => item.replace(/^(?:- |\* |\d+\. )/, "").trim())) errors.push(`${label} needs at least one item.`);
    }
    if (section.type === "image") {
      if (section.url && !/^(?:https?:\/\/|\/(?!\/))/.test(section.url)) errors.push(`Image section ${index + 1} needs an HTTP URL or local path.`);
      if (!(section.url ?? "").trim()) errors.push(`Image section ${index + 1} needs an image URL or path.`);
      if (!(section.alt ?? "").trim()) errors.push(`Image section ${index + 1} needs alt text.`);
    }
    if (section.type === "video") {
      if (!(section.url ?? "").trim()) errors.push(`Video section ${index + 1} needs a YouTube or Twitch URL.`);
      else if (!trustedVideo(section.url ?? "")) errors.push(`Video section ${index + 1} must use a supported YouTube or Twitch URL.`);
    }
  });
  return errors;
}

export function submissionBlocker(sections: ComposerSection[]) {
  const index = sections.findIndex(section => validateComposerSections([section], true).length > 0);
  const section = sections[index];
  const missingAlt = section?.type === "image" && !(section.alt ?? "").trim();
  return {
    error: `Draft saved, but not submitted. ${missingAlt ? `Add alt text to image section ${index + 1}.` : validateComposerSections(sections, true).join(" ")}`,
    focusSectionId: section?.id ?? "",
    focusField: missingAlt ? "alt" : "section",
  };
}

export function articleModulesFromDraft(input: z.infer<typeof draftSchema>) {
  if (input.sectionsJson) return composerSectionsToModules(parseComposerSections(input.sectionsJson, input.sections, input.videoUrl));
  return bodyModules(input.sections, input.videoUrl);
}

export function draftDocument(input: z.infer<typeof draftSchema>): EditorialDocument {
  const modules = articleModulesFromDraft(input);
  const heroSrc = input.image || KOMA_FEATURE_PLACEHOLDER;
  const heroAlt = input.imageAlt || KOMA_FEATURE_PLACEHOLDER_ALT;
  if (!input.sectionsJson && input.image) modules.unshift({ id: "lead-image", type: "image", version: 1, presentation: "wide", content: { src: input.image, alt: input.imageAlt, caption: "Editorial reference image", source: "Editorial dashboard", rights: "Documented by editor" } });
  return { schemaVersion: 1, header: { eyebrow: "COMMUNITY EDITION", title: input.title, panelHeadline: input.title.slice(0, 90), standfirst: input.summary, byline: "KOMA://PLAY Editorial", hero: { id: "editorial-placeholder", src: heroSrc, alt: heroAlt }, heroCaption: input.image ? "Editorial reference image" : "KOMA://PLAY editorial placeholder" }, modules };
}

export function documentBodyText(sections: string, sectionsJson = "") {
  if (sectionsJson) return composerSectionsToText(parseComposerSections(sectionsJson, sections));
  return sections.trim();
}

export type EditorialWorkItem = {
  feature_id: string;
  title: string;
  slug: string;
  summary: string;
  lifecycle_status: string;
  updated_at: string;
  working_document: EditorialDocument & { body?: string };
  editorial_body?: string;
  category_id?: string | null;
  image?: string | null;
  image_alt?: string | null;
  reviewer_note?: string | null;
};

function moduleToComposerSection(module: ArticleModule, index: number): ComposerSection | null {
  const id = module.id || `module-${index + 1}`;
  if (module.id === "lead-image") return null;
  if (module.type === "heading") return { id, type: "heading", text: String(module.content?.text ?? "") };
  if (module.type === "paragraph") return { id, type: "paragraph", text: String(module.content?.text ?? "") };
  if (module.type === "unordered-list") return { id, type: "bullet-list", text: ((module.content?.items as unknown[]) ?? []).map(String).join("\n") };
  if (module.type === "ordered-list") return { id, type: "numbered-list", text: ((module.content?.items as unknown[]) ?? []).map(String).join("\n") };
  if (module.type === "pull-quote") return { id, type: "quote", text: String(module.content?.text ?? ""), attribution: String(module.content?.attribution ?? "") };
  if (module.type === "image") return { id, type: "image", url: String(module.content?.src ?? ""), alt: String(module.content?.alt ?? ""), text: String(module.content?.caption ?? "") };
  if (module.type === "video") return { id, type: "video", url: String(module.content?.url ?? "") };
  if (module.type === "divider") return { id, type: "divider" };
  return { id, type: "legacy", module };
}

export function composerFromWorkItem(item: EditorialWorkItem): z.infer<typeof draftSchema> {
  const modules = Array.isArray(item.working_document?.modules) ? item.working_document.modules : [];
  const imageModule = modules.find((module) => module.type === "image" && module.id === "lead-image");
  const modularSections = Array.isArray(item.working_document?.modules) ? modules.map(moduleToComposerSection).filter((section): section is ComposerSection => Boolean(section)) : legacyBodyToComposerSections(item.working_document?.body ?? item.editorial_body ?? "");
  const sectionsJson = serializeComposerSections(modularSections);
  const sections = composerSectionsToText(parseComposerSections(sectionsJson));
  return {
    featureId: item.feature_id,
    title: item.working_document?.header?.title || item.title,
    slug: item.slug,
    summary: item.working_document?.header?.standfirst || item.summary,
    categoryId: item.category_id ?? "",
    image: String(imageModule?.content?.src ?? item.working_document?.header?.hero?.src ?? item.image ?? ""),
    imageAlt: String(imageModule?.content?.alt ?? item.working_document?.header?.hero?.alt ?? item.image_alt ?? ""),
    sections,
    sectionsJson,
    videoUrl: "",
    status: ["submitted", "changes_requested", "publish_ready", "published", "archived", "taken_down"].includes(item.lifecycle_status) ? item.lifecycle_status as any : "draft",
  };
}

export function editorialStatusLabel(status: string) {
  if (status === "submitted") return "Submitted for review";
  if (status === "changes_requested") return "Changes requested";
  if (status === "publish_ready" || status === "approved") return "Publish-ready";
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  if (status === "taken_down") return "Taken down";
  return "Draft";
}

export function myPanelsStatusLabel(status: string) {
  if (status === "submitted") return "In shared review";
  if (status === "changes_requested") return "Needs revision";
  if (status === "publish_ready" || status === "approved") return "Ready for publication";
  if (status === "published") return "Published";
  return "Private draft";
}

export function reviewInboxStatusLabel(status: string) {
  if (status === "submitted") return "Awaiting review";
  if (status === "changes_requested") return "Returned for revision";
  if (status === "publish_ready" || status === "approved") return "Ready for publication";
  return editorialStatusLabel(status);
}
