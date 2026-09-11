"use client";
import { useEffect, useState } from "react";
import { publishingApi } from "../../lib/publication/api";
type Report = {
  id: string;
  feature_id: string;
  reporter_id: string;
  kind: string;
  body: string;
  source_url: string;
  status: string;
  moderator_note: string | null;
  created_at: string;
};
type Audit = {
  id: string;
  report_id: string;
  actor_id: string;
  previous_status: string;
  new_status: string;
  note: string;
  created_at: string;
};
export function CorrectionQueue() {
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [status, setStatus] = useState("Submitted");
  const [page, setPage] = useState(0);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    publishingApi<{ reports: Report[]; audit: Audit[] }>(
      `corrections?status=${encodeURIComponent(status)}&page=${page}`,
    )
      .then((data) => {
        if (live) {
          setReports(data.reports);
          setAudit(data.audit);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [status, page, version]);
  return (
    <section className="correction-queue">
      <h2>Private correction reports</h2>
      <label>
        Status{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          {["Submitted", "In Review", "Resolved", "Dismissed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {reports.length ? (
        reports.map((r) => (
          <article className="op-card" key={r.id}>
            <span className="op-badge">{r.status}</span>
            <h3>{r.kind}</h3>
            <p className="op-prose">{r.body}</p>
            <small>
              Reporter {r.reporter_id} · Feature {r.feature_id} ·{" "}
              {new Date(r.created_at).toLocaleString("en-GB")}
            </small>
            {r.source_url && (
              <p>
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Supporting source ↗
                </a>
              </p>
            )}
            {r.moderator_note && <p>{r.moderator_note}</p>}
            <form
              className="op-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const form = new FormData(e.currentTarget);
                try {
                  await publishingApi("review-correction", {
                    id: r.id,
                    status: form.get("status"),
                    note: form.get("note"),
                  });
                  setMessage("Correction decision recorded.");
                  setVersion((v) => v + 1);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Decision
                <select
                  name="status"
                  disabled={["Resolved", "Dismissed"].includes(r.status)}
                >
                  <option>In Review</option>
                  <option>Resolved</option>
                  <option>Dismissed</option>
                </select>
              </label>
              <label>
                Private moderator note
                <textarea name="note" minLength={4} maxLength={2000} required />
              </label>
              <button
                disabled={busy || ["Resolved", "Dismissed"].includes(r.status)}
              >
                Record decision
              </button>
            </form>
            <details>
              <summary>Correction audit history</summary>
              {audit
                .filter((a) => a.report_id === r.id)
                .map((a) => (
                  <p key={a.id}>
                    {a.previous_status ?? "New"} → {a.new_status} · {a.note} ·{" "}
                    {new Date(a.created_at).toLocaleString("en-GB")} · Actor{" "}
                    {a.actor_id}
                  </p>
                ))}
            </details>
          </article>
        ))
      ) : (
        <p>No reports in this queue.</p>
      )}
      <div className="op-actions">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous reports
        </button>
        <button
          disabled={reports.length < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          Next reports
        </button>
      </div>
    </section>
  );
}
