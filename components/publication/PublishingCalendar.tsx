"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "../open-panel/AuthGate";
import { publishingApi } from "../../lib/publication/api";
import {
  panelState,
  acceptsContributions,
  type Catalogue,
} from "../../lib/publication/domain";
import {
  IssueEditor,
  WeeklyDropEditor,
  FeatureAssignmentEditor,
  TaxonomyEditor,
  RelationshipEditor,
} from "./PublishingEditors";
type Overview = { data: Catalogue; pending: number; corrections: number };
export function PublishingCalendar() {
  return (
    <AuthGate moderator>
      {(user) =>
        user.role === "admin" ? (
          <Calendar />
        ) : (
          <p role="alert">
            Only administrators can manage publication schedules. Moderators can
            finish reviews in the moderation desk.
          </p>
        )
      }
    </AuthGate>
  );
}
function Calendar() {
  const [overview, setOverview] = useState<Overview>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [issueId, setIssueId] = useState("");
  const [dropId, setDropId] = useState("");
  const [featureId, setFeatureId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    publishingApi<Overview>("overview")
      .then((data) => {
        if (live) {
          setOverview(data);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);
  const saved = () => {
    setMessage("Publishing changes saved.");
    setVersion((v) => v + 1);
  };
  const mutate = async (action: string, body: unknown) => {
    setBusy(true);
    try {
      await publishingApi(action, body);
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!overview)
    return (
      <p role={error ? "alert" : "status"}>
        {error || "Loading publishing calendar…"}
      </p>
    );
  const { data } = overview;
  const current = data.issues.find((i) => i.status === "current");
  const feature = data.features.find((f) => f.id === featureId);
  const issue = data.issues.find((i) => i.id === issueId);
  const drop = data.drops.find((d) => d.id === dropId);
  const active = data.features.filter((f) => {
    const i = data.issues.find((i) => i.id === f.issue_id);
    return i && acceptsContributions(f, i, data.now);
  });
  return (
    <>
      {data.message && <p className="op-notice">{data.message}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="publishing-overview">
        <p>
          <b>{current?.title ?? "No current issue"}</b>
          <span>
            {current
              ? `${Math.max(0, Math.ceil((Date.parse(current.closes_at) - Date.parse(data.now)) / 86400000))} days until closure`
              : "Choose a draft issue below"}
          </span>
        </p>
        <p>
          <b>
            {data.drops.filter((d) => d.status === "published").length}{" "}
            published /{" "}
            {data.drops.filter((d) => d.status === "scheduled").length}{" "}
            scheduled drops
          </b>
          <span>
            {data.features.filter((f) => f.lifecycle_status === "draft").length}{" "}
            draft features
          </span>
        </p>
        <p>
          <b>{active.length} active Open Panels</b>
          <span>
            {
              active.filter(
                (f) =>
                  panelState(
                    f,
                    data.issues.find((i) => i.id === f.issue_id)!,
                    data.now,
                  ) === "closing_panel",
              ).length
            }{" "}
            closing soon
          </span>
        </p>
        <p>
          <b>{overview.pending} contributions awaiting review</b>
          <span>{overview.corrections} unresolved correction reports</span>
        </p>
      </div>
      <div className="op-actions">
        <button disabled={busy} onClick={() => void mutate("reconcile", {})}>
          Reconcile deadlines and scheduled drops
        </button>
        <Link href="/moderation">Moderation desk →</Link>
      </div>
      <section>
        <h2>Issue calendar</h2>
        <div className="calendar-issues">
          {data.issues.map((i) => {
            const own = data.features.filter((f) => f.issue_id === i.id);
            return (
              <article className="op-card" key={i.id}>
                <span className="op-badge">{i.status}</span>
                <h3>{i.title}</h3>
                <p>
                  {new Date(i.opens_at).toUTCString()} →{" "}
                  {new Date(i.closes_at).toUTCString()}
                </p>
                <p>
                  {own.length} features ·{" "}
                  {
                    data.drops.filter(
                      (d) => d.issue_id === i.id && d.status === "published",
                    ).length
                  }{" "}
                  published weeks ·{" "}
                  {own.filter((f) => f.lifecycle_status === "draft").length}{" "}
                  drafts to carry
                </p>
                <p>
                  Finalisation requires all deadlines to pass, all contributions
                  to be resolved, and four or five published weeks (Issue Zero
                  is exempt).
                </p>
                <Link href={`/issues/${i.slug}?preview=1`}>
                  Preview issue / strips ↗
                </Link>
                <div className="op-actions">
                  {i.status === "draft" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate("issue-state", {
                          id: i.id,
                          status: "current",
                        })
                      }
                    >
                      Mark current
                    </button>
                  )}
                  {i.status === "current" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate("issue-state", {
                          id: i.id,
                          status: "finalising",
                        })
                      }
                    >
                      Close submissions / finalise
                    </button>
                  )}
                  {i.status === "finalising" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate("issue-state", {
                          id: i.id,
                          status: "archived",
                        })
                      }
                    >
                      Archive completed issue
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <label>
          Edit or create issue
          <select value={issueId} onChange={(e) => setIssueId(e.target.value)}>
            <option value="">Create new issue</option>
            {data.issues
              .filter((i) => i.status !== "archived")
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
          </select>
        </label>
        <IssueEditor key={issueId || "new"} issue={issue} onSaved={saved} />
      </section>
      <details className="op-history">
        <summary>Weekly drops / labels, scheduling and order</summary>
        <label>
          Edit or create drop
          <select value={dropId} onChange={(e) => setDropId(e.target.value)}>
            <option value="">Create new weekly drop</option>
            {data.drops
              .filter((d) =>
                data.issues.some(
                  (i) =>
                    i.id === d.issue_id &&
                    ["draft", "current"].includes(i.status),
                ),
              )
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {data.issues.find((i) => i.id === d.issue_id)?.title} /{" "}
                  {d.label}
                </option>
              ))}
          </select>
        </label>
        <WeeklyDropEditor
          key={dropId || "new"}
          drop={drop}
          data={data}
          onSaved={saved}
        />
        {drop && (
          <Link
            href={`/issues/${data.issues.find((i) => i.id === drop.issue_id)?.slug}?preview=1`}
          >
            Preview weekly strip ↗
          </Link>
        )}
      </details>
      <details className="op-history">
        <summary>Feature organisation / assignment and carry-over</summary>
        <label>
          Edit or create feature
          <select
            value={featureId}
            onChange={(e) => setFeatureId(e.target.value)}
          >
            <option value="">Create new feature</option>
            {data.features
              .filter(
                (f) =>
                  !["final_panel", "archived"].includes(f.lifecycle_status),
              )
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} / {f.lifecycle_status}
                </option>
              ))}
          </select>
        </label>
        <FeatureAssignmentEditor
          key={`${featureId}-${version}`}
          feature={feature}
          data={data}
          onSaved={saved}
        />
        {feature && (
          <Link href={`/features/${feature.slug}?preview=1`}>
            Preview feature ↗
          </Link>
        )}
      </details>
      <details className="op-history">
        <summary>Categories, formats and topics</summary>
        <TaxonomyEditor onSaved={saved} />
      </details>
      <details className="op-history">
        <summary>Continuations and related features</summary>
        <RelationshipEditor data={data} onSaved={saved} />
      </details>
    </>
  );
}
