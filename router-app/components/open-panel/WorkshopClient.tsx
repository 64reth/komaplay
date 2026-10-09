import {useWorkshopRecovery} from "./useWorkshopRecovery";
import type {DraftContent} from "../../lib/workshop-recovery";
import {contributionState} from "../../lib/contribution-state";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import {
  contributionSchema,
  genericContributionSection,
  screenshotError,
  types,
  type Contribution,
} from "../../lib/open-panel";
import { MarkdownText } from "../MarkdownText";
import { WritingToolbar } from "../WritingToolbar";
import { LatestUploadCoordinator } from "../../lib/latest-upload";

type Activity = {
  public_credit: string;
  contribution_type: string;
  published_at: string;
};

async function responseJson(response: Response) {
  const value = (await response.json()) as {
    error?: string;
    path?: string;
    id?: string;
    duplicate?: boolean;
  };
  if (!response.ok)
    throw new Error(value.error ?? "The Workshop request failed.");
  return value;
}

export function WorkshopClient({
  ownerId="",
  publication=[],
  featureId,
  featureSlug,
  defaultCredit,
  contributions,
  activity,
  readOnly,
}: {
  ownerId?:string;
  publication?:{contribution_id:string;published:boolean;cited:boolean}[];
  featureId: string;
  featureSlug: string;
  defaultCredit: string;
  contributions: Contribution[];
  activity: Activity[];
  readOnly: boolean;
}) {
  const revalidator = useRevalidator();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading,setUploading]=useState(false);
  const [screenshot, setScreenshot] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVersion,setEditVersion]=useState("");
  const [bodyText, setBodyText] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const uploadCoordinator=useRef(new LatestUploadCoordinator());
  useEffect(()=>()=>uploadCoordinator.current.cancelAll(),[]);

  const recovery=useWorkshopRecovery(ownerId,featureId,(content,target)=>{
    const form=formRef.current;if(!form)return;
    form.reset();setBodyText(String(content.body??""));setScreenshot(String(content.screenshot_path??""));setEditingId(target);setEditVersion(String(content.expected_edit_version??""));
    for(const [name,value] of Object.entries(content)){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement&&field.type==="checkbox")field.checked=value===true;else if(field instanceof HTMLInputElement||field instanceof HTMLSelectElement)field.value=String(value);}
  });
  function capture(){if(!formRef.current||busy||(readOnly&&!editingId))return;const values=Object.fromEntries(new FormData(formRef.current));if(!values.title&&!bodyRef.current?.value&&!screenshot&&!recovery.hasWriting())return;recovery.change({...values,body:bodyRef.current?.value??bodyText,feature_id:featureId,...(editingId?{expected_edit_version:editVersion}:{}),target_section:genericContributionSection,screenshot_path:screenshot,publication_consent:values.publication_consent==="on"} as DraftContent,editingId);}
  useEffect(()=>{if(recovery.ready)capture();},[screenshot,editingId,editVersion,bodyText]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const invalid = screenshotError(file);
    if (invalid) return setError(invalid);
    const ticket=uploadCoordinator.current.begin("screenshot");
    setUploading(true);
    setError("");
    setMessage(screenshot?"Replacing screenshot…":"Uploading screenshot…");
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await responseJson(
        await fetch("/member/workshop/upload", { method: "POST", body,signal:ticket.signal }),
      );
      if(!ticket.current())return;
      setScreenshot(result.path ?? "");
      setMessage(screenshot?"This screenshot was replaced. Submit again to keep the latest version.":"Screenshot attached privately to this proposal.");
    } catch (cause) {
      if(!ticket.current()||(cause instanceof DOMException&&cause.name==="AbortError"))return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The screenshot could not be uploaded.",
      );
    } finally {
      if(ticket.current())setUploading(false);
      ticket.finish();
      event.target.value="";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy||uploading) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = contributionSchema.safeParse({
      ...values,
      feature_id: featureId,
      target_section: genericContributionSection,
      screenshot_path: screenshot,
      publication_consent: values.publication_consent === "on",
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      setBusy(false);
      return;
    }
    try {
      capture();
      const result = await recovery.submit();
      form.reset();
      setBodyText("");
      setScreenshot("");
      setEditingId(null);
      setMessage(
        result.duplicate
          ? "This proposal was already submitted. Its existing copy is shown below."
          : "Contribution submitted. It is waiting for editorial review.",
      );
      revalidator.revalidate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The contribution could not be submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revise(item: Contribution) {
    const form = formRef.current;
    if (!form) return;
    try{await recovery.startRevision();}catch{setError("Save or resolve your current draft before opening a revision.");return;}
    setEditingId(item.id);
    setEditVersion(String(item.edit_version??""));
    setBodyText(item.body);
    setScreenshot(item.screenshot_path);
    for (const [name, value] of Object.entries({ type: item.type, title: item.title, source_url: item.source_url, media_url: item.media_url, public_credit: item.public_credit })) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
    }
    const consent = form.elements.namedItem("publication_consent");
    if (consent instanceof HTMLInputElement) consent.checked = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage("Edit your submission, then resubmit it for independent review. If review starts meanwhile, your correction stays in recovery and cannot overwrite the reviewed version.");
  }

  async function withdraw(id: string) {
    if (busy || !confirm("Withdraw this contribution from review?")) return;
    setBusy(true);
    setError("");
    try {
      await responseJson(
        await fetch("/member/workshop/withdraw", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      );
      setMessage("Contribution withdrawn.");
      revalidator.revalidate();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The contribution could not be withdrawn.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="workshop-workbench"
        aria-labelledby="workbench-heading"
      >
        <p className="op-eyebrow editorial-marker">AT THE WORKBENCH</p>
        <h2 id="workbench-heading" tabIndex={-1}>
          Developing the next revision
        </h2>
        {activity.length ? (
          <ul>
            {activity.map((item, index) => (
              <li key={`${item.published_at}-${index}`}>
                {item.public_credit} recently added{" "}
                {item.contribution_type.toLowerCase()} work to the published
                panel.
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Published Workshop activity will appear here. No live-presence
            tracking is used.
          </p>
        )}
      </section>

      {(!readOnly||ownerId) && (
        <form
          ref={formRef}
          className="op-form"
          onChange={()=>queueMicrotask(capture)}
          onSubmit={submit}
          aria-labelledby="proposal-heading"
        >
          <h2 id="proposal-heading">Propose a contribution</h2>
          <p role="status">{recovery.state}</p>
          {recovery.conflict&&<div><button type="button" onClick={recovery.keepAsNew}>KEEP LOCAL WRITING AS NEW DRAFT</button><button type="button" onClick={()=>{if(window.confirm("Replace this tab’s writing with the saved server version?"))void recovery.loadServer().catch(e=>setError(e.message));}}>LOAD SERVER VERSION</button></div>}
          <fieldset disabled={(readOnly&&!editingId)||busy||!recovery.ready||recovery.conflict}>
          {editingId && <p className="op-notice"><b>EDITING SUBMISSION · RESUBMISSION REQUIRES REVIEW</b></p>}
          <p>
            Offer one focused addition to this feature for editorial review.
          </p>
          <label>
            Contribution type
            <select name="type" defaultValue="Tip">
              {types.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required minLength={4} maxLength={120} spellCheck />
          </label>
          <label>
            Contribution
            <span className="field-help">Use the writing tools for simple Markdown-style formatting. Raw text stays editable.</span>
            <WritingToolbar textareaRef={bodyRef} value={bodyText} onChange={setBodyText} label="Workshop contribution writing tools" />
            <textarea
              spellCheck
              ref={bodyRef}
              name="body"
              required
              minLength={20}
              maxLength={8000}
              rows={7}
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
            />
          </label>
          <label>
            Source URL (optional)
            <input name="source_url" type="url" placeholder="https://" />
          </label>
          <label>
            YouTube or Twitch URL (optional)
            <input name="media_url" type="url" placeholder="https://" />
          </label>
          <label>
            Screenshot (optional · PNG, JPEG or WebP · 5 MB maximum)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
            />
          </label>
          {uploading&&<p role="status">This image is still uploading.</p>}
          {screenshot && (
            <p role="status">
              Screenshot attached.{" "}
              <button type="button" onClick={() => {uploadCoordinator.current.cancel("screenshot");setUploading(false);setScreenshot("");setError("");setMessage("Screenshot removed. You can upload another image.");}}>
                Remove attachment
              </button>
            </p>
          )}
          <label>
            Public credit if published
            <select name="public_credit" defaultValue={defaultCredit}>
              <option>Display name</option>
              <option>Pen name</option>
              <option>Anonymous Panelist</option>
            </select>
          </label>
          <label className="op-check">
            <input name="publication_consent" type="checkbox" required />
            If this contribution is accepted, its edited text, supporting
            evidence and your selected credit may become part of the permanent
            public Community Edition and its Panel Citation.
          </label>
          <button className="action-primary" disabled={busy}>
            {busy ? "SUBMITTING…" : editingId ? "RESUBMIT TO WORKSHOP" : "SUBMIT TO WORKSHOP"}
          </button>
          </fieldset>
        </form>
      )}

      {message && (
        <p className="op-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="op-notice" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="your-contributions-heading">
        <h2 id="your-contributions-heading">Your contributions</h2>
        {contributions.length ? (
          contributions.map((item) => (
            <article className="contribution-card" id={`contribution-${item.id}`} tabIndex={-1} key={item.id}>
              <p className="op-eyebrow">
                {item.type}
              </p>
              <h3>{item.title}</h3>
              <p><MarkdownText text={item.body} /></p>
              <p>
                <b>{contributionState(item,publication.find(p=>p.contribution_id===item.id)?.published,publication.find(p=>p.contribution_id===item.id)?.cited)}</b> ·{" "}
                {new Date(item.updated_at).toLocaleDateString("en-GB")}
              </p>
              {item.source_url && (
                <p>
                  <a href={item.source_url} rel="noreferrer" target="_blank">
                    Supporting source ↗
                  </a>
                </p>
              )}
              {item.media_url && (
                <p>
                  <a href={item.media_url} rel="noreferrer" target="_blank">
                    Approved external clip ↗
                  </a>
                </p>
              )}
              {item.screenshot_path && (
                <p>
                  <a
                    href={`/member/workshop/image?path=${encodeURIComponent(item.screenshot_path)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View private screenshot ↗
                  </a>
                </p>
              )}
              {item.moderator_note && (
                <p>
                  <b>Editorial guidance:</b> {item.moderator_note}
                </p>
              )}
              {publication.some(p=>p.contribution_id===item.id&&p.published) && (
                <Link to={`/features/${featureSlug}`}>
                  VIEW IN COMMUNITY EDITION →
                </Link>
              )}
              {(item.incorporated_at||["In Review","Accepted"].includes(item.status))&&<p><Link to={`/features/${featureSlug}/report?kind=Factual%20error`}>REQUEST EDITORIAL CORRECTION →</Link><span className="field-help"> Reviewed work is not edited in place.</span></p>}
              {["Submitted", "Changes Requested"].includes(item.status) && (
                  <div className="profile-actions">
                    {!item.incorporated_at && <button type="button" disabled={busy||!recovery.ready} onClick={() => revise(item)}>{item.status==="Submitted"?"EDIT SUBMISSION":"REVISE AND RESUBMIT"}</button>}
                    <button type="button" disabled={busy} onClick={() => withdraw(item.id)}>WITHDRAW</button>
                  </div>
                )}
            </article>
          ))
        ) : (
          <p>No proposals submitted for this feature yet.</p>
        )}
      </section>
    </>
  );
}
