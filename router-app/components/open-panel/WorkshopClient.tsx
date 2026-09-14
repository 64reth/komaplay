import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import {
  contributionSchema,
  screenshotError,
  sections,
  types,
  type Contribution,
} from "../../lib/open-panel";
import { MarkdownText } from "../MarkdownText";
import { WritingToolbar } from "../WritingToolbar";

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
  featureId,
  featureSlug,
  defaultCredit,
  contributions,
  activity,
  readOnly,
}: {
  featureId: string;
  featureSlug: string;
  defaultCredit: string;
  contributions: Contribution[];
  activity: Activity[];
  readOnly: boolean;
}) {
  const revalidator = useRevalidator();
  const formRef = useRef<HTMLFormElement>(null);
  const sectionRef = useRef<HTMLSelectElement>(null);
  const [busy, setBusy] = useState(false);
  const [screenshot, setScreenshot] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bodyText, setBodyText] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function chooseSection(section: string) {
    if (!sectionRef.current || readOnly) return;
    sectionRef.current.value = section;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    sectionRef.current.focus();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const invalid = screenshotError(file);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const result = await responseJson(
        await fetch("/member/workshop/upload", { method: "POST", body }),
      );
      setScreenshot(result.path ?? "");
      setMessage("Screenshot attached privately to this proposal.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The screenshot could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const parsed = contributionSchema.safeParse({
      ...values,
      feature_id: featureId,
      screenshot_path: screenshot,
      publication_consent: values.publication_consent === "on",
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      setBusy(false);
      return;
    }
    try {
      const result = await responseJson(
        await fetch("/member/workshop/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed.data),
        }),
      );
      form.reset();
      setBodyText("");
      setScreenshot("");
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

      <section className="workshop-sections" aria-labelledby="sections-heading">
        <p className="op-eyebrow">CURRENT ARTICLE CONSTRUCTION</p>
        <h2 id="sections-heading">Sections in this panel</h2>
        {sections.map((section, index) => {
          const count = contributions.filter(
            (item) => item.target_section === section,
          ).length;
          return (
            <article key={section} className="workshop-section-card">
              <p>
                {String(index + 1).padStart(2, "0")} · {section.toUpperCase()}
              </p>
              <p>Current published section · {count} of your proposals</p>
              {!readOnly && (
                <button type="button" onClick={() => chooseSection(section)}>
                  ADD TO THIS SECTION →
                </button>
              )}
            </article>
          );
        })}
      </section>

      {!readOnly && (
        <form
          ref={formRef}
          className="op-form"
          onSubmit={submit}
          aria-labelledby="proposal-heading"
        >
          <h2 id="proposal-heading">Propose a contribution</h2>
          <p>
            Attach one focused proposal to this feature and one article section.
          </p>
          <div className="op-form-row">
            <label>
              Contribution type
              <select name="type" defaultValue="Tip">
                {types.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              Target section
              <select
                ref={sectionRef}
                name="target_section"
                defaultValue="Overview"
              >
                {sections.map((section) => (
                  <option key={section}>{section}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Title
            <input name="title" required minLength={4} maxLength={120} />
          </label>
          <label>
            Contribution
            <span className="field-help">Use the writing tools for simple Markdown-style formatting. Raw text stays editable.</span>
            <WritingToolbar textareaRef={bodyRef} value={bodyText} onChange={setBodyText} label="Workshop contribution writing tools" />
            <textarea
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
              disabled={busy}
              onChange={upload}
            />
          </label>
          {screenshot && (
            <p role="status">
              Screenshot attached.{" "}
              <button type="button" onClick={() => setScreenshot("")}>
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
            {busy ? "SUBMITTING…" : "SUBMIT TO WORKSHOP"}
          </button>
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
            <article className="contribution-card" key={item.id}>
              <p className="op-eyebrow">
                {item.type} · {item.target_section}
              </p>
              <h3>{item.title}</h3>
              <p><MarkdownText text={item.body} /></p>
              <p>
                <b>{item.status.toUpperCase()}</b> ·{" "}
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
              {item.status === "Accepted" && (
                <Link to={`/features/${featureSlug}`}>
                  VIEW IN COMMUNITY EDITION →
                </Link>
              )}
              {!readOnly &&
                ["Submitted", "Changes Requested"].includes(item.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => withdraw(item.id)}
                  >
                    WITHDRAW
                  </button>
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
