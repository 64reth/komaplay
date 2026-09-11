"use client";
import { useState } from "react";
import {
  contributionSchema,
  screenshotError,
  types,
  sections,
  type Contribution,
} from "../../lib/open-panel/domain";
import { api } from "../../lib/open-panel/api";
import Link from "next/link";
export function ContributionComposer({
  featureId,
  existing,
  onSaved,
  onCancel,
}: {
  featureId: string;
  existing?: Contribution;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshot, setScreenshot] = useState(existing?.screenshot_path ?? "");
  return (
    <form
      className="op-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        try {
          const parsed = contributionSchema.safeParse({
            ...values,
            feature_id: featureId,
            screenshot_path: screenshot,
            publication_consent: values.publication_consent === "on",
          });
          if (!parsed.success)
            throw new Error(
              parsed.error.issues.map((i) => i.message).join(" "),
            );
          await api("save", { ...parsed.data, id: existing?.id });
          form.reset();
          setScreenshot("");
          onSaved();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not save contribution.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{existing ? "Edit contribution" : "Propose a contribution"}</h2>
      <p>
        Offer a useful addition to the Published Panel. A moderator will review
        it before publication.
      </p>
      <p>
        <Link href="/handbook">Read the community handbook</Link>
      </p>
      <div className="op-form-row">
        <label>
          Contribution type
          <select name="type" defaultValue={existing?.type ?? "Tip"}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Target section
          <select
            name="target_section"
            defaultValue={existing?.target_section ?? "Overview"}
          >
            {sections.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Title
        <input
          name="title"
          required
          minLength={4}
          maxLength={120}
          defaultValue={existing?.title}
        />
      </label>
      <label>
        Contribution
        <textarea
          name="body"
          rows={6}
          required
          minLength={20}
          maxLength={8000}
          defaultValue={existing?.body}
        />
      </label>
      <label>
        Source URL (optional)
        <input
          name="source_url"
          type="url"
          placeholder="https://"
          defaultValue={existing?.source_url}
        />
      </label>
      <label>
        YouTube or Twitch URL (optional)
        <input
          name="media_url"
          type="url"
          placeholder="https://"
          defaultValue={existing?.media_url}
        />
      </label>
      <label>
        Screenshot (optional · PNG, JPEG or WebP · 5 MB maximum)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const invalid = screenshotError(file);
            if (invalid) {
              setError(invalid);
              return;
            }
            setBusy(true);
            setError("");
            try {
              const form = new FormData();
              form.set("file", file);
              const result = await api<{ path: string }>("upload", form);
              setScreenshot(result.path);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <label>
        Public credit if published
        <select name="public_credit" defaultValue="Display name">
          <option>Display name</option>
          <option>Pen name</option>
          <option>Anonymous Panelist</option>
        </select>
      </label>
      <label className="op-check">
        <input name="publication_consent" type="checkbox" required />
        If this contribution is accepted, its edited text, supporting evidence
        and your selected credit may become part of the permanent public
        Community Edition and its Panel Citation.
      </label>
      {screenshot && (
        <p role="status">
          Screenshot attached.{" "}
          <button type="button" onClick={() => setScreenshot("")}>
            Remove attachment
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="op-actions">
        <button disabled={busy}>
          {busy
            ? "Saving…"
            : existing
              ? "Resubmit for review"
              : "Submit to Workshop"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel edit
          </button>
        )}
      </div>
    </form>
  );
}
