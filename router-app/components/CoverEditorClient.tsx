import { useEffect, useMemo, useRef, useState } from "react";
import { Form, useActionData, useNavigation } from "react-router";
import { CoverPreview } from "./CoverPreview";
import { coverErrors, coverLinePositions, coverPresets, type CoverDraft, type CoverLinePosition } from "../lib/cover-editor";
import { LatestUploadCoordinator } from "../lib/latest-upload";

type IssueRow=CoverDraft & { id:string; status:string; archived_at:string|null };
type Panel={id:string;title:string;image:string;image_alt:string;lifecycle_status:string;status:string};
type Result={error?:string;success?:string;field?:string};
const label=(value:string)=>value.replaceAll("-"," ").replace(/(^|\s)\S/g,c=>c.toUpperCase());
const media=(path:string)=>path.startsWith("editorial/")?`/api/editorial/image?path=${encodeURIComponent(path)}`:path;

export function CoverEditorClient({ issues, panelsByIssue, initialId }: { issues:IssueRow[];panelsByIssue:Record<string,Panel[]>;initialId:string }) {
  const action=useActionData<Result>(), navigation=useNavigation();
  const [issueId,setIssueId]=useState(initialId);
  const issue=issues.find(item=>item.id===issueId) ?? issues[0];
  const [drafts,setDrafts]=useState<Record<string,CoverDraft>>(()=>Object.fromEntries(issues.map(item=>[item.id,{...item,issue_id:item.id,secondary_cover_lines:item.secondary_cover_lines??[]}])));
  const draft=drafts[issue.id], panels=panelsByIssue[issue.id]??[];
  const errors=coverErrors(draft,panels.map(panel=>panel.id));
  const fileRef=useRef<HTMLInputElement>(null), uploads=useRef(new LatestUploadCoordinator()), [uploadStates,setUploadStates]=useState<Record<string,{status:"uploading"|"replacing"|"uploaded"|"failed";message:string}>>({});
  useEffect(()=>()=>uploads.current.cancelAll(),[]);
  const uploadState=uploadStates[issue.id], uploading=uploadState?.status==="uploading"||uploadState?.status==="replacing";
  const imageUrl=useMemo(()=>media(draft.cover_art),[draft.cover_art]);
  const update=<K extends keyof CoverDraft>(key:K,value:CoverDraft[K])=>setDrafts(all=>({...all,[issue.id]:{...all[issue.id], [key]:value}}));
  const line=(position:CoverLinePosition,value:string)=>update("secondary_cover_lines",[
    ...draft.secondary_cover_lines.filter(item=>item.position!==position),...(value.trim()?[{position,headline:value}]:[])
  ]);
  const clearUpload=(clearArtwork=false)=>{uploads.current.cancel(issue.id);setUploadStates(current=>{const next={...current};delete next[issue.id];return next;});if(fileRef.current)fileRef.current.value="";if(clearArtwork){update("cover_art","");update("cover_art_alt","");}};
  const upload=async()=>{const file=fileRef.current?.files?.[0];if(!file)return;const replacing=Boolean(draft.cover_art),ticket=uploads.current.begin(issue.id);setUploadStates(current=>({...current,[issue.id]:{status:replacing?"replacing":"uploading",message:replacing?"Replacing cover artwork…":"Uploading cover artwork…"}}));const body=new FormData();body.set("file",file);body.set("slug",draft.slug||"issue-cover");try{const response=await fetch("/member/editorial/upload",{method:"POST",body,signal:ticket.signal});const result=await response.json() as {path?:string;error?:string};if(!response.ok||!result.path)throw new Error(result.error||"Upload failed");if(!ticket.current())return;update("cover_art",result.path);setUploadStates(current=>({...current,[issue.id]:{status:"uploaded",message:replacing?"This artwork was replaced. Save again to keep the latest version.":"Uploaded. Add alt text, then save."}}));}catch(error){if(!ticket.current()||(error instanceof DOMException&&error.name==="AbortError"))return;setUploadStates(current=>({...current,[issue.id]:{status:"failed",message:"The image upload failed. Try again or remove it."}}));}finally{ticket.finish();if(fileRef.current)fileRef.current.value="";}};
  return <div className="cover-editor-grid">
    <section className="cover-editor-controls">
      {action?.error&&<p role="alert" className="op-notice">{action.error}</p>}{action?.success&&<p role="status" className="op-notice">{action.success}</p>}
      <label>Issue<select value={issue.id} onChange={event=>setIssueId(event.target.value)}>{issues.map(item=><option key={item.id} value={item.id}>{item.title} · {label(item.status)}</option>)}</select></label>
      <Form method="post" noValidate onSubmit={event=>{const intent=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;if(intent?.value==="archive"&&Object.keys(errors).length){event.preventDefault();const first=event.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(errors)[0]}"]`);first?.focus();}}}>
        <input type="hidden" name="issue_id" value={issue.id}/><input type="hidden" name="secondary_cover_lines" value={JSON.stringify(draft.secondary_cover_lines)}/>
        <fieldset disabled={issue.status==="archived"}><legend>Issue identity</legend>
          <label>Issue title<input name="title" required maxLength={150} spellCheck value={draft.title} onChange={e=>update("title",e.target.value)}/>{errors.title&&<small role="alert">{errors.title}</small>}</label>
          <div className="cover-field-pair"><label>Issue number<input name="issue_number" type="number" min="0" value={draft.issue_number} onChange={e=>update("issue_number",e.target.value)}/></label><label>Month<input name="month" type="number" min="1" max="12" value={draft.month} onChange={e=>update("month",e.target.value)}/></label><label>Year<input name="year" type="number" min="2000" max="2200" value={draft.year} onChange={e=>update("year",e.target.value)}/></label></div>
          <label>Issue slug<input name="slug" pattern="[a-z0-9-]{3,80}" value={draft.slug} onChange={e=>update("slug",e.target.value)}/>{errors.slug&&<small role="alert">{errors.slug}</small>}</label>
        </fieldset>
        <fieldset disabled={issue.status==="archived"}><legend>Artwork and lead</legend>
          <label>Lead panel<select name="lead_feature_id" value={draft.lead_feature_id} onChange={e=>{const panel=panels.find(item=>item.id===e.target.value);update("lead_feature_id",e.target.value);if(panel&&!draft.lead_headline)update("lead_headline",panel.title);}}><option value="">Choose published panel…</option>{panels.map(panel=><option key={panel.id} value={panel.id}>{panel.title}</option>)}</select>{errors.lead_feature_id&&<small role="alert">{errors.lead_feature_id}</small>}</label>
          <label>Use panel artwork<select value={draft.cover_art} onChange={e=>{clearUpload();const panel=panels.find(item=>item.image===e.target.value);update("cover_art",e.target.value);if(panel&&!draft.cover_art_alt)update("cover_art_alt",panel.image_alt);}}><option value="">Choose artwork…</option>{panels.filter(panel=>panel.image).map(panel=><option key={panel.id} value={panel.image}>{panel.title}</option>)}</select></label>
          <label>Upload new cover artwork<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>
          <input type="hidden" name="cover_art" value={draft.cover_art}/>{errors.cover_art&&<small role="alert">{errors.cover_art}</small>}
          {uploadState&&<p className={uploadState.status==="failed"?"field-error":"field-help"} role={uploadState.status==="failed"?"alert":"status"}>{uploadState.message}</p>}
          <label>Cover artwork alt text<input name="cover_art_alt" maxLength={400} spellCheck value={draft.cover_art_alt} onChange={e=>{if(uploadState?.status==="failed")clearUpload();update("cover_art_alt",e.target.value);}}/>{errors.cover_art_alt&&<small role="alert">{errors.cover_art_alt}</small>}</label>
          {(draft.cover_art||uploadState)&&<button type="button" className="op-button" onClick={()=>clearUpload(true)}>REMOVE COVER ARTWORK</button>}
          <label>Artwork credit<input name="cover_art_credit" maxLength={180} spellCheck value={draft.cover_art_credit} onChange={e=>update("cover_art_credit",e.target.value)}/></label>
          <label>Lead headline<textarea name="lead_headline" required maxLength={120} spellCheck value={draft.lead_headline} onChange={e=>update("lead_headline",e.target.value)}/>{errors.lead_headline&&<small role="alert">{errors.lead_headline}</small>}</label>
        </fieldset>
        <fieldset disabled={issue.status==="archived"}><legend>Template dressing</legend>
          <label>Cover preset<select name="cover_preset" value={draft.cover_preset} onChange={e=>update("cover_preset",e.target.value as CoverDraft["cover_preset"])}>{coverPresets.map(preset=><option key={preset} value={preset}>{label(preset)}</option>)}</select></label>
          <label>Theme / strapline<input name="cover_theme" maxLength={80} spellCheck value={draft.cover_theme} onChange={e=>update("cover_theme",e.target.value)}/></label>
          {coverLinePositions.map((position,index)=><label key={position}>{label(position)}<input name={`secondary_${index}`} maxLength={80} spellCheck value={draft.secondary_cover_lines.find(item=>item.position===position)?.headline??""} onChange={e=>line(position,e.target.value)}/>{errors[`secondary_${index}`]&&<small role="alert">{errors[`secondary_${index}`]}</small>}</label>)}
          <label>Featuring line<input name="featuring_line" maxLength={180} spellCheck value={draft.featuring_line} onChange={e=>update("featuring_line",e.target.value)}/></label>
          <label>Editor’s note teaser<textarea name="editor_note_teaser" maxLength={240} spellCheck value={draft.editor_note_teaser} onChange={e=>update("editor_note_teaser",e.target.value)}/></label>
        </fieldset>
        {Object.keys(errors).length>0&&<p className="op-notice">Complete {Object.keys(errors).length} cover requirement{Object.keys(errors).length===1?"":"s"} before archiving.</p>}
        <div className="profile-actions"><button className="op-button" name="intent" value="save" disabled={navigation.state!=="idle"||uploading||issue.status==="archived"}>SAVE COVER</button>{["current","finalising"].includes(issue.status)&&<button className="op-button action-primary" name="intent" value="archive" disabled={navigation.state!=="idle"||uploading||Object.keys(errors).length>0}>SAVE &amp; ARCHIVE ISSUE</button>}</div>
      </Form>
    </section>
    <aside className="cover-preview-column"><p className="op-eyebrow">LIVE COVER PREVIEW</p><CoverPreview draft={draft} imageUrl={imageUrl} panelCount={panels.length}/><p className="field-help">Template-controlled alignment keeps every slot readable. Resize the window to inspect the responsive cover.</p></aside>
  </div>;
}
