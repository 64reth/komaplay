import { useRef } from "react";
import { WritingToolbar } from "./WritingToolbar";
import { composerSectionTypes, createComposerSection, moveComposerSection, removeComposerSection, updateComposerSection, validateComposerSections, type ComposerSection } from "../lib/editorial-alpha";

export const sectionLabels = { paragraph: "PARAGRAPH", heading: "HEADING", image: "IMAGE", quote: "QUOTE", "bullet-list": "BULLET LIST", "numbered-list": "NUMBERED LIST", video: "VIDEO", divider: "DIVIDER", legacy: "EXISTING SECTION" };

function SectionFields({ section, change, upload }: { section: ComposerSection; change: (patch: Partial<ComposerSection>) => void; upload: (event: React.ChangeEvent<HTMLInputElement>, id: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  if (section.type === "divider") return <hr />;
  if (section.type === "legacy") return <p>This existing {section.module?.type} section is preserved. It can be moved or removed.</p>;
  if (section.type === "image") return <>
    <label>Image URL or path<input value={section.url ?? ""} onChange={e => change({ url: e.target.value })} maxLength={2000} /></label>
    <label>Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e, section.id)} /></label>
    <label>Alt text (required)<input id={`body-alt-${section.id}`} aria-invalid={!(section.alt ?? "").trim()} aria-describedby={!(section.alt ?? "").trim() ? `body-alt-help-${section.id}` : undefined} value={section.alt ?? ""} onChange={e => change({ alt: e.target.value })} maxLength={400} /></label>
    {!(section.alt ?? "").trim() && <p id={`body-alt-help-${section.id}`} className="field-error">Alt text is required for accessibility.</p>}
    <label>Caption (optional)<input value={section.text ?? ""} onChange={e => change({ text: e.target.value })} /></label>
  </>;
  if (section.type === "video") return <label>YouTube/Twitch URL<input value={section.url ?? ""} onChange={e => change({ url: e.target.value })} maxLength={2000} /></label>;
  if (section.type === "heading") return <label>Heading text<input value={section.text ?? ""} onChange={e => change({ text: e.target.value })} maxLength={20000} /></label>;
  return <>
    {section.type === "paragraph" && <WritingToolbar inlineOnly textareaRef={ref} value={section.text ?? ""} onChange={text => change({ text })} label="Paragraph writing tools" />}
    <label>{section.type.includes("list") ? "Items — one per line" : section.type === "quote" ? "Quote text" : "Paragraph text"}
      <textarea ref={ref} rows={5} maxLength={20000} value={section.text ?? ""} onChange={e => change({ text: e.target.value })} />
    </label>
    {section.type === "quote" && <label>Attribution (optional)<input maxLength={400} value={section.attribution ?? ""} onChange={e => change({ attribution: e.target.value })} /></label>}
  </>;
}

export function ArticleSectionBuilder({ sections, onChange, upload }: { sections: ComposerSection[]; onChange: (sections: ComposerSection[]) => void; upload: (event: React.ChangeEvent<HTMLInputElement>, id: string) => void }) {
  return <section aria-label="Article body" className="article-section-builder">
    <h2>Article body</h2>
    {sections.map((section, index) => <fieldset className="composer-module" key={section.id} id={`body-section-${section.id}`} tabIndex={-1}>
      <legend>{index + 1}. {sectionLabels[section.type]}</legend>
      <SectionFields section={section} change={patch => onChange(updateComposerSection(sections, section.id, patch))} upload={upload} />
      {validateComposerSections([section], true).map(error => <p className="field-error" key={error}>{error.replace(/section 1/g, `section ${index + 1}`)}</p>)}
      <div className="profile-actions">
        <button type="button" className="op-button" disabled={index === 0} onClick={() => onChange(moveComposerSection(sections, section.id, "up"))} aria-label={`Move section ${index + 1} up`}>MOVE UP</button>
        <button type="button" className="op-button" disabled={index === sections.length - 1} onClick={() => onChange(moveComposerSection(sections, section.id, "down"))} aria-label={`Move section ${index + 1} down`}>MOVE DOWN</button>
        <button type="button" className="op-button" onClick={() => onChange(removeComposerSection(sections, section.id))} aria-label={`Remove section ${index + 1}`}>REMOVE</button>
      </div>
    </fieldset>)}
    {!sections.length && <p>Add a section to start writing.</p>}
    <label>ADD SECTION<select value="" disabled={sections.length >= 120} onChange={e => { if (e.target.value) onChange([...sections, createComposerSection(e.target.value as typeof composerSectionTypes[number])]); }}>
      <option value="">Choose section type…</option>
      {composerSectionTypes.map(type => <option key={type} value={type}>{sectionLabels[type]}</option>)}
    </select></label>
  </section>;
}
