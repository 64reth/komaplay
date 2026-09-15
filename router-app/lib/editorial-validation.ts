import { z } from "zod";
import type { ComposerSection } from "./editorial-alpha";
import { trustedVideo } from "./media";
import { moduleTypes, editorialDocumentSchema } from "./document";

export type DocumentIssue = { key: string; sectionId: string | null; field: string; code: string; message: string; value?: string };
export type PanelInput = { title: string; slug: string; summary: string; image?: string; imageAlt?: string; categoryId?: string; format?: string };
export const submissionCopy = {
  blocked: "Your draft is safely saved, but it hasn’t been submitted yet.",
  submitted: "Everything looks ready. Your panel has been submitted for review.",
  saved: "Draft saved",
  submitFailure: "Your draft is still safe, but we couldn’t submit it just now. Please try again. If the problem continues, contact the KOMA team.",
  saveFailure: "We couldn’t save your latest changes just now. Keep this page open and try again. If the problem continues, contact the KOMA team.",
};
export function imageAddress(value: string) {
  if (/^\/(?!\/)/.test(value)) return !/[\\\s]/.test(value);
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
const bounded = (max: number, message: string) => z.string().trim().max(max, message);
export const panelSubmissionSchema = z.object({
  title: bounded(150, "Shorten the title to 150 characters or fewer.").min(1, "Add a title before submitting.").refine(value => !value || value.length >= 4, "Use at least 4 characters for the title."),
  slug: bounded(80, "Shorten the panel address to 80 characters or fewer.").min(3, "Add a panel address of at least 3 characters.").regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens in the panel address."),
  summary: bounded(1000, "Shorten the summary to 1,000 characters or fewer.").min(8, "Add a summary of at least 8 characters before submitting."),
  image: bounded(2000, "Use a shorter feature image address.").refine(value => !value || imageAddress(value), "Choose a feature image using an http or https link, or a local image path."),
  imageAlt: bounded(400, "Shorten the feature image description to 400 characters or fewer."),
  categoryId: z.string().refine(value => !value || z.string().uuid().safeParse(value).success, "Choose a category from the list, or use the default."),
  format: z.literal("essay", { errorMap: () => ({ message: "Use the Essay format for this panel." }) }),
});
const text = (label: string) => bounded(20000, `Shorten ${label} to 20,000 characters or fewer.`).min(1, `Add some text to ${label} before submitting.`);
const list = (label: string) => bounded(20000, `Shorten ${label} to 20,000 characters or fewer.`).refine(value => value.split("\n").some(item => item.trim().replace(/^(?:[-*]|\d+\.)\s*/, "").trim()), `Add at least one item to ${label}, with one item per line.`);
const labels: Record<string, string> = { paragraph: "Paragraph", heading: "Heading", image: "Image", quote: "Quote", "bullet-list": "Bullet list", "numbered-list": "Numbered list", video: "Embed", divider: "Divider", legacy: "Existing section" };
export function sectionSubmissionSchema(section: ComposerSection, position: number) {
  const label = `${labels[section.type] ?? "Section"} ${position}`;
  switch (section.type) {
    case "paragraph": case "heading": return z.object({ text: text(label) });
    case "quote": return z.object({ text: text(label), attribution: bounded(400, `Shorten the attribution in ${label} to 400 characters or fewer.`) });
    case "bullet-list": case "numbered-list": return z.object({ text: list(label) });
    case "image": return z.object({
      url: bounded(2000, `Use a shorter image address in ${label}.`).min(1, `Choose an image for ${label} before submitting.`).refine(value => !value || imageAddress(value), `Check the image link in ${label}. Use an http or https link, or a local image path.`),
      alt: bounded(400, `Shorten the description for ${label} to 400 characters or fewer.`).min(1, `${label} needs a short description for readers using screen readers.`),
      text: bounded(20000, `Shorten the caption in ${label} to 20,000 characters or fewer.`),
    });
    case "video": return z.object({ url: bounded(2000, `Use a shorter link in ${label}.`).min(1, `Add a YouTube or Twitch video link to ${label}.`).refine(value => !value || !!trustedVideo(value), `Check the link in ${label}—it doesn’t appear to be a supported YouTube or Twitch address.`) });
    case "divider": return z.object({});
    default: return z.object({});
  }
}
function collect(schema: z.ZodTypeAny, value: unknown, sectionId: string | null): DocumentIssue[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map(issue => {
    const field = String(issue.path[0] ?? "section");
    return { key: `${sectionId ?? "panel"}:${field}:${issue.code}`, sectionId, field, code: issue.code, message: issue.message };
  }).filter((issue, index, all) => all.findIndex(other => other.sectionId === issue.sectionId && other.field === issue.field) === index);
}
export function validateSections(sections: ComposerSection[]): DocumentIssue[] {
  if (!sections.length) return [{ key: "panel:sections:required", sectionId: null, field: "sections", code: "required", message: "Add at least one section before submitting." }];
  const issues = sections.flatMap((section, index) => {
    if (section.type === "legacy") {
      // Older published module types remain supported; do not invent new editable fields.
      if (!section.module || !moduleTypes.includes(section.module.type as typeof moduleTypes[number])) return [{ key: `${section.id}:section:unsupported`, sectionId: section.id, field: "section", code: "unsupported", message: `Replace Existing section ${index + 1} with a supported section before submitting.` }];
      const legacy = editorialDocumentSchema.safeParse({schemaVersion:1,header:{eyebrow:'',title:'Draft',panelHeadline:'Draft',byline:'Editor'},modules:[section.module]});
      if (!legacy.success) return [{key:`${section.id}:section:incomplete`,sectionId:section.id,field:'section',code:'incomplete',message:`Existing section ${index + 1} needs information that this editor cannot change. Replace it with supported sections before submitting.`}];
      return [];
    }
    return collect(sectionSubmissionSchema(section, index + 1), { text: "", url: "", alt: "", attribution: "", ...section }, section.id);
  });
  if (sections.length > 120) issues.unshift({key:'panel:sections:limit',sectionId:null,field:'sections',code:'limit',message:'Keep this panel to 120 sections or fewer before submitting.'});
  if (JSON.stringify(sections).length > 60000) issues.push({key:'panel:sections:length',sectionId:null,field:'sections',code:'length',message:'Shorten this panel before submitting. Its combined section content is over the current size limit.'});
  return issues;
}
export function orderIssues(issues: DocumentIssue[], sections: ComposerSection[]) {
  const panelFields=['title','slug','summary','format','categoryId','image','imageAlt','sections'];
  const position = (issue: DocumentIssue) => issue.sectionId === null ? panelFields.indexOf(issue.field) : panelFields.length + sections.findIndex(section=>section.id===issue.sectionId);
  return issues.sort((a,b)=>position(a)-position(b));
}
export function validateEditorialSubmission(panel: PanelInput, sections: ComposerSection[], categoryIds?: readonly string[]): DocumentIssue[] {
  const issues = collect(panelSubmissionSchema, { image: "", imageAlt: "", categoryId: "", format: "essay", ...panel }, null);
  if (panel.image?.trim() && !panel.imageAlt?.trim() && !issues.some(issue=>issue.field==='imageAlt')) issues.push({ key:'panel:imageAlt:required',sectionId:null,field:'imageAlt',code:'required',message:'Add a short feature image description for readers using screen readers.' });
  if (panel.categoryId && categoryIds && !categoryIds.includes(panel.categoryId) && !issues.some(issue=>issue.field==='categoryId')) issues.push({ key:'panel:categoryId:unavailable', sectionId:null,field:'categoryId',code:'unavailable',value:panel.categoryId,message:'Choose an available category, or use the default.' });
  // Keep focus order aligned with the fixed metadata controls.
  const fields=['title','slug','summary','format','categoryId','image','imageAlt'];
  issues.sort((a,b)=>fields.indexOf(a.field)-fields.indexOf(b.field));
  return orderIssues([...issues,...validateSections(sections)],sections);
}
export function issueTarget(issue: Pick<DocumentIssue, "sectionId" | "field">) { return issue.sectionId ? `section-${issue.sectionId}-${issue.field}` : `panel-${issue.field}`; }
export function fieldAttributes(issues: DocumentIssue[], sectionId: string | null, field: string) {
  const id = issueTarget({ sectionId, field });
  const invalid = issues.some(issue => issue.sectionId === sectionId && issue.field === field);
  return { id, "aria-invalid": invalid, "aria-describedby": invalid ? `${id}-error` : undefined };
}
export function requirementsMessage(count: number) { return `${count} ${count === 1 ? "thing needs" : "things need"} attention before this panel can be submitted.`; }
