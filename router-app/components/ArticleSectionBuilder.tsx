import { useRef } from "react";
import { WritingToolbar } from "./WritingToolbar";
import { composerSectionTypes, createComposerSection, moveComposerSection, removeComposerSection, updateComposerSection, type ComposerSection } from "../lib/editorial-alpha";

import { validateSections, fieldAttributes, type DocumentIssue } from "../lib/editorial-validation";
import { FieldErrors } from "./EditorialErrors";

export const sectionLabels = { paragraph: "PARAGRAPH", heading: "HEADING", image: "IMAGE", quote: "QUOTE", "bullet-list": "BULLET LIST", "numbered-list": "NUMBERED LIST", video: "VIDEO", divider: "DIVIDER", legacy: "EXISTING SECTION" };

type UploadState={status:"uploading"|"replacing"|"uploaded"|"failed";message:string};
function SectionFields({ section, change, upload, issues, uploadState, onImageEdit }: { issues: DocumentIssue[]; section: ComposerSection; change: (patch: Partial<ComposerSection>) => void; upload: (event: React.ChangeEvent<HTMLInputElement>, id: string) => void;uploadState?:UploadState;onImageEdit:(id:string)=>void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const attrs = (field: string) => fieldAttributes(issues, section.id, field);
  const errors = (field: string) => <FieldErrors issues={issues} sectionId={section.id} field={field} />;
  if (section.type === "divider") return <hr />;
  if (section.type === "legacy") return <p>This existing {section.module?.type} section is preserved. It can be moved or removed.</p>;
  if (section.type === "image") return <>
    <label>Image URL or path<input {...attrs("url")} value={section.url ?? ""} onChange={e => {onImageEdit(section.id);change({ url: e.target.value });}} maxLength={2000} /></label>
    <label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e, section.id)} /></label>
    {uploadState&&<p className={uploadState.status==="failed"?"field-error":"field-help"} role={uploadState.status==="failed"?"alert":"status"}>{uploadState.message}</p>}
    {errors("url")}
    <label>Alt text (required)<input {...attrs("alt")} value={section.alt ?? ""} onChange={e => {if(uploadState?.status==="failed")onImageEdit(section.id);change({ alt: e.target.value });}} maxLength={400} /></label>
    {errors("alt")}
    {(section.url||uploadState)&&<button type="button" className="op-button" onClick={()=>{onImageEdit(section.id);change({url:"",alt:""});}}>REMOVE IMAGE</button>}
    <label>Caption (optional)<input {...attrs("text")} spellCheck value={section.text ?? ""} onChange={e => change({ text: e.target.value })} /></label>{errors("text")}
  </>;
  if (section.type === "video") return <><label>YouTube/Twitch URL<input {...attrs("url")} value={section.url ?? ""} onChange={e => change({ url: e.target.value })} maxLength={2000} /></label>{errors("url")}</>;
  if (section.type === "heading") return <><label>Heading text<input {...attrs("text")} spellCheck value={section.text ?? ""} onChange={e => change({ text: e.target.value })} maxLength={20000} /></label>{errors("text")}</>;
  return <>
    {section.type === "paragraph" && <WritingToolbar inlineOnly textareaRef={ref} value={section.text ?? ""} onChange={text => change({ text })} label="Paragraph writing tools" />}
    <label>{section.type.includes("list") ? "Items — one per line" : section.type === "quote" ? "Quote text" : "Paragraph text"}
      <textarea {...attrs("text")} ref={ref} rows={5} maxLength={20000} spellCheck value={section.text ?? ""} onChange={e => change({ text: e.target.value })} />
    </label>
    {errors("text")}
    {section.type === "quote" && <label>Attribution (optional)<input {...attrs("attribution")} maxLength={400} value={section.attribution ?? ""} onChange={e => change({ attribution: e.target.value })} /></label>}
    {errors("attribution")}
  </>;
}

export function ArticleSectionBuilder({ sections, onChange, upload, uploadStates={}, onImageEdit=()=>{}, onRemove=()=>{} }: { sections: ComposerSection[]; onChange: (sections: ComposerSection[]) => void; upload: (event: React.ChangeEvent<HTMLInputElement>, id: string) => void;uploadStates?:Record<string,UploadState>;onImageEdit?:(id:string)=>void;onRemove?:(id:string)=>void }) {
  const issues = validateSections(sections);
  return <section aria-label="Article body" className="article-section-builder">
    <h2>Article body</h2>
    {sections.map((section, index) => <fieldset className="composer-module" key={section.id} id={`section-${section.id}-section`} aria-invalid={issues.some(issue => issue.sectionId === section.id)} aria-describedby={issues.some(issue => issue.sectionId === section.id && issue.field === "section") ? `section-${section.id}-section-error` : undefined} tabIndex={-1}>
      <legend>{index + 1}. {sectionLabels[section.type]}</legend>
      <SectionFields issues={issues} section={section} change={patch => onChange(updateComposerSection(sections, section.id, patch))} upload={upload} uploadState={uploadStates[section.id]} onImageEdit={onImageEdit} />
      <FieldErrors issues={issues} sectionId={section.id} field="section" />
      <div className="profile-actions">
        <button type="button" className="op-button" disabled={index === 0} onClick={() => onChange(moveComposerSection(sections, section.id, "up"))} aria-label={`Move section ${index + 1} up`}>MOVE UP</button>
        <button type="button" className="op-button" disabled={index === sections.length - 1} onClick={() => onChange(moveComposerSection(sections, section.id, "down"))} aria-label={`Move section ${index + 1} down`}>MOVE DOWN</button>
        <button type="button" className="op-button" onClick={() => {onRemove(section.id);onChange(removeComposerSection(sections, section.id));}} aria-label={`Remove section ${index + 1}`}>REMOVE</button>
      </div>
    </fieldset>)}
    {!sections.length && <p>Add a section to start writing.</p>}
    <label>ADD SECTION<select id="panel-sections" aria-describedby={!sections.length ? "panel-sections-error" : undefined} aria-invalid={!sections.length} value="" onChange={e => { if (e.target.value && sections.length < 120) onChange([...sections, createComposerSection(e.target.value as typeof composerSectionTypes[number])]); }}>
      <option value="">Choose section type…</option>
      {composerSectionTypes.map(type => <option key={type} value={type} disabled={sections.length >= 120}>{sectionLabels[type]}</option>)}
    </select></label>
    <FieldErrors issues={issues} field="sections" />
  </section>;
}
