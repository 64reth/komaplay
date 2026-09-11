"use client";
import { useEffect, useState } from "react";
import { ContributionCard } from "./ContributionCard";
import { api } from "../../lib/open-panel/api";
import Link from "next/link";
import {
  moderationSchema,
  type Contribution,
} from "../../lib/open-panel/domain";
type Audit = {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string;
  actor_id: string;
  note: string | null;
  created_at: string;
};
export function ModerationDetail({
  item,
  onDone,
  onClose,
}: {
  item: Contribution;
  onDone: () => void;
  onClose: () => void;
}) {
  const [heading, setHeading] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [note, setNote] = useState("");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ audit: Audit[] }>(`audit?id=${item.id}`)
      .then((data) => {
        if (live) setAudit(data.audit);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [item.id]);
  const decide = async (status: string, edited = false) => {
    setBusy(true);
    setError("");
    try {
      const input = moderationSchema.parse({
        id: item.id,
        status,
        heading: edited ? heading : item.title,
        body: edited ? body : item.body,
        note,
      });
      await api("moderate", input);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save decision.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="op-review" aria-label="Contribution review">
      <button onClick={onClose}>← Back to queue</button>
      <ContributionCard item={item} />
      {item.screenshot_path && (
        <img
          className="op-screenshot"
          src={`/api/open-panel/image?path=${encodeURIComponent(item.screenshot_path)}`}
          alt={`Submitted screenshot for ${item.title}`}
        />
      )}
      <form
        className="op-form"
        onSubmit={(e) => {
          e.preventDefault();
          void decide("Accepted", true);
        }}
      >
        <h2>Editorial decision</h2>
        <p>
          <Link href="/handbook">Community handbook</Link>
        </p>
        <label>
          Published heading
          <input
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            minLength={4}
            maxLength={120}
            required
          />
        </label>
        <label>
          Edited body
          <textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={20}
            maxLength={8000}
            required
          />
        </label>
        <label>
          Moderator note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
          />
        </label>
        <p>
          Accept publishes the original submission. Edit and Accept publishes
          the heading and body above. Decisions and contributor credit are
          recorded together.
        </p>
        {error && <p role="alert">{error}</p>}
        <fieldset
          disabled={busy || ["Accepted", "Rejected"].includes(item.status)}
          className="op-actions"
        >
          <legend>Review actions</legend>
          <button type="button" onClick={() => void decide("Accepted")}>
            Accept
          </button>
          <button type="submit">Edit and Accept</button>
          <button
            type="button"
            disabled={item.status === "In Review"}
            onClick={() => void decide("In Review")}
          >
            Mark In Review
          </button>
          <button
            type="button"
            disabled={item.status === "Changes Requested"}
            onClick={() => void decide("Changes Requested")}
          >
            Request Changes
          </button>
          <button type="button" onClick={() => void decide("Rejected")}>
            Reject
          </button>
        </fieldset>
      </form>
      <details className="op-history" open>
        <summary>Moderation audit history</summary>
        {audit.length ? (
          audit.map((a) => (
            <article key={a.id}>
              <b>{a.action}</b>
              <p>
                {a.previous_status ?? "New"} → {a.new_status} ·{" "}
                {new Date(a.created_at).toLocaleString("en-GB")}
              </p>
              <small>Actor: {a.actor_id}</small>
              {a.note && <p>{a.note}</p>}
            </article>
          ))
        ) : (
          <p>No audit entries loaded.</p>
        )}
      </details>
    </section>
  );
}
