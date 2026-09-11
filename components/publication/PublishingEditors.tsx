"use client";
import { useState, type ReactNode } from "react";
import type {
  Catalogue,
  Issue,
  Drop,
  Feature,
} from "../../lib/publication/domain";
import { publishingApi } from "../../lib/publication/api";
function SaveForm({
  action,
  id,
  children,
  onSaved,
  transform,
}: {
  action: string;
  id?: string;
  children: ReactNode;
  onSaved: () => void;
  transform?: (
    v: Record<string, unknown>,
    f: FormData,
  ) => Record<string, unknown>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="op-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        let values: Record<string, unknown> = {
          ...Object.fromEntries(form),
          ...(id ? { id } : {}),
        };
        for (const field of [
          "opens_at",
          "closes_at",
          "scheduled_at",
          "deadline_override",
        ])
          if (values[field])
            values[field] = new Date(String(values[field]) + "Z").toISOString();
        if (transform) values = transform(values, form);
        setBusy(true);
        setError("");
        try {
          await publishingApi(action, values);
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      <button disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
const dateValue = (date?: string | null) =>
  date ? new Date(date).toISOString().slice(0, 16) : "";
function Field({
  name,
  label,
  value = "",
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  value?: string | number;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} required={required} />
    </label>
  );
}
function OrderField({
  name,
  value,
  label,
}: {
  name: string;
  value: number;
  label: string;
}) {
  const [position, setPosition] = useState(value);
  return (
    <label>
      {label}
      <input
        name={name}
        type="number"
        min={0}
        value={position}
        onChange={(e) => setPosition(Math.max(0, Number(e.target.value)))}
      />
      <span className="op-actions">
        <button
          type="button"
          onClick={() => setPosition((v) => Math.max(0, v - 1))}
          disabled={!position}
        >
          Move up
        </button>
        <button type="button" onClick={() => setPosition((v) => v + 1)}>
          Move down
        </button>
      </span>
      <small>Save changes to apply the new position.</small>
    </label>
  );
}
export function IssueEditor({
  issue,
  onSaved,
}: {
  issue?: Issue;
  onSaved: () => void;
}) {
  return (
    <SaveForm action="issue" id={issue?.id} onSaved={onSaved}>
      <h2>{issue ? "Edit issue" : "Create issue"}</h2>
      <p>
        All calendar fields are UTC. Issue number, month and slug are permanent
        after creation.
      </p>
      <Field
        name="issue_number"
        label="Issue number"
        type="number"
        value={issue?.issue_number ?? 1}
        required
      />
      <Field
        name="slug"
        label="Stable issue slug"
        value={issue?.slug ?? "issue-01-october-2026"}
        required
      />
      <Field name="title" label="Title" value={issue?.title} required />
      <Field name="subtitle" label="Theme / subtitle" value={issue?.subtitle} />
      <Field
        name="cover_label"
        label="Cover label"
        value={issue?.cover_label}
      />
      <label>
        Introduction
        <textarea name="introduction" defaultValue={issue?.introduction} />
      </label>
      <div className="op-form-row">
        <Field
          name="year"
          label="Year"
          type="number"
          value={issue?.year ?? 2026}
          required
        />
        <Field
          name="month"
          label="Month (1–12)"
          type="number"
          value={issue?.month ?? 10}
          required
        />
      </div>
      <Field
        name="opens_at"
        label="Opens at (UTC)"
        type="datetime-local"
        value={dateValue(issue?.opens_at)}
        required
      />
      <Field
        name="closes_at"
        label="Closes at (UTC)"
        type="datetime-local"
        value={dateValue(issue?.closes_at)}
        required
      />
      <Field
        name="closing_days"
        label="Closing Panel period (days)"
        type="number"
        value={issue?.closing_days ?? 7}
        required
      />
    </SaveForm>
  );
}
export function WeeklyDropEditor({
  drop,
  data,
  onSaved,
}: {
  drop?: Drop;
  data: Catalogue;
  onSaved: () => void;
}) {
  return (
    <SaveForm action="drop" id={drop?.id} onSaved={onSaved}>
      <h2>{drop ? "Edit weekly drop" : "Create weekly drop"}</h2>
      <label>
        Issue
        <select name="issue_id" defaultValue={drop?.issue_id}>
          {data.issues
            .filter((i) => i.status === "draft" || i.status === "current")
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
        </select>
      </label>
      <Field
        name="week_number"
        label="Week number (1–5)"
        type="number"
        value={drop?.week_number ?? 1}
        required
      />
      <Field
        name="label"
        label="Editable drop label"
        value={drop?.label ?? "First Frame"}
        required
      />
      <label>
        Editorial introduction
        <textarea name="introduction" defaultValue={drop?.introduction} />
      </label>
      <label>
        Publication state
        <select name="status" defaultValue={drop?.status ?? "draft"}>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Publish immediately</option>
        </select>
      </label>
      <Field
        name="scheduled_at"
        label="Scheduled publication (UTC)"
        type="datetime-local"
        value={dateValue(drop?.scheduled_at)}
      />
      <OrderField
        name="display_order"
        label="Weekly display order"
        value={drop?.display_order ?? 1}
      />
    </SaveForm>
  );
}
export function FeatureAssignmentEditor({
  feature,
  data,
  onSaved,
}: {
  feature?: Feature;
  data: Catalogue;
  onSaved: () => void;
}) {
  const [parent, setParent] = useState(
    feature?.issue_id ??
      data.issues.find((i) => i.status === "current")?.id ??
      data.issues[0]?.id ??
      "",
  );
  return (
    <SaveForm
      action="feature"
      id={feature?.id}
      onSaved={onSaved}
      transform={(v, form) => ({ ...v, tag_ids: form.getAll("tag_ids") })}
    >
      <h2>{feature ? "Organise feature" : "Create feature"}</h2>
      <p>
        To carry a draft forward, choose its new issue and drop. Published
        features keep their original issue. All times are UTC.
      </p>
      <Field
        name="slug"
        label="Stable feature slug"
        value={feature?.slug}
        required
      />
      <Field name="title" label="Title" value={feature?.title} required />
      <label>
        Issue
        <select
          name="issue_id"
          value={parent}
          onChange={(e) => setParent(e.target.value)}
        >
          {data.issues
            .filter((i) => ["draft", "current"].includes(i.status))
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Weekly drop
        <select
          key={parent}
          name="weekly_drop_id"
          defaultValue={
            feature?.issue_id === parent ? feature.weekly_drop_id : undefined
          }
          required
        >
          {data.drops
            .filter((d) => d.issue_id === parent)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.status}
              </option>
            ))}
        </select>
      </label>
      <OrderField
        name="strip_position"
        label="Panel position"
        value={feature?.strip_position ?? 1}
      />
      <label>
        Category
        <select name="category_id" defaultValue={feature?.category_id}>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Format
        <select name="format_id" defaultValue={feature?.format_id}>
          {data.formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Topics / tags</legend>
        {data.tags.map((t) => (
          <label key={t.id} className="op-check">
            <input
              name="tag_ids"
              type="checkbox"
              value={t.id}
              defaultChecked={data.featureTags.some(
                (ft) => ft.feature_id === feature?.id && ft.tag_id === t.id,
              )}
            />
            {t.name}
          </label>
        ))}
      </fieldset>
      <label>
        Publication state
        <select
          name="lifecycle_status"
          defaultValue={
            feature?.lifecycle_status === "draft"
              ? "draft"
              : feature
                ? "open_panel"
                : "draft"
          }
        >
          <option value="draft">Draft / unpublished</option>
          <option value="open_panel">Published / Open Panel</option>
        </select>
      </label>
      <Field
        name="deadline_override"
        label="Exceptional deadline override (UTC, optional)"
        type="datetime-local"
        value={dateValue(feature?.deadline_override)}
      />
      <Field name="summary" label="One-line summary" value={feature?.summary} />
      <label>
        Editorial text (optional for the original static features)
        <textarea
          rows={8}
          name="editorial_body"
          defaultValue={feature?.editorial_body}
        />
      </label>
      <label>
        Existing clue artwork
        <select
          name="image"
          defaultValue={feature?.image ?? "/assets/clue-ocarina.png"}
        >
          {["ocarina", "seat", "shield", "vhs"].map((n) => (
            <option value={`/assets/clue-${n}.png`} key={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <Field
        name="image_alt"
        label="Image description"
        value={feature?.image_alt}
      />
      <label>
        Panel width
        <select
          name="panel_size"
          defaultValue={feature?.panel_size ?? "standard"}
        >
          {["narrow", "standard", "wide"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Panel composition
        <select name="panel_class" defaultValue={feature?.panel_class ?? ""}>
          {["", "ocarina", "vice", "tokon", "vhs"].map((s) => (
            <option key={s} value={s}>
              {s || "Default"}
            </option>
          ))}
        </select>
      </label>
    </SaveForm>
  );
}
export function TaxonomyEditor({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState("category");
  return (
    <>
      <label>
        Add a category, format or topic
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="category">Category</option>
          <option value="format">Format</option>
          <option value="tag">Topic / tag</option>
        </select>
      </label>
      <SaveForm key={kind} action={kind} onSaved={onSaved}>
        <Field name="name" label="Name" required />
        <Field name="slug" label="Slug" required />
        {kind === "tag" && (
          <label>
            Topic kind
            <select name="kind">
              {["franchise", "platform", "genre", "era", "subject"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        )}
      </SaveForm>
    </>
  );
}
export function RelationshipEditor({
  data,
  onSaved,
}: {
  data: Catalogue;
  onSaved: () => void;
}) {
  return (
    <SaveForm action="relationship" onSaved={onSaved}>
      <h2>Feature continuity</h2>
      <label>
        New / follow-up feature
        <select name="feature_id">
          {data.features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Relationship
        <select name="kind">
          <option value="continues_from">Continues from</option>
          <option value="related">Related feature</option>
        </select>
      </label>
      <label>
        Earlier / related feature
        <select name="related_id">
          {data.features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </label>
    </SaveForm>
  );
}
