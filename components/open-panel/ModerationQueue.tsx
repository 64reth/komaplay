"use client";
import { useEffect, useState } from "react";
import { CorrectionQueue } from "../publication/CorrectionQueue";
import { AuthGate } from "./AuthGate";
import { ContributionFilters, type Filters } from "./ContributionFilters";
import { ContributionCard } from "./ContributionCard";
import { ModerationDetail } from "./ModerationDetail";
import { api } from "../../lib/open-panel/api";
import type { Contribution, Role } from "../../lib/open-panel/domain";
export function ModerationQueue() {
  return (
    <AuthGate moderator>
      {(user) => (
        <>
          <Queue />
          <CorrectionQueue />
          {user.role === "admin" && <RoleManagement />}
        </>
      )}
    </AuthGate>
  );
}
function Queue() {
  const [filters, setFilters] = useState<Filters>({
    type: "",
    status: "Submitted",
    feature_id: "",
    date: "",
  });
  const [items, setItems] = useState<Contribution[]>([]);
  const [features, setFeatures] = useState<{ id: string; title: string }[]>([]);
  const [selected, setSelected] = useState<Contribution>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    api<{
      contributions: Contribution[];
      features: { id: string; title: string }[];
      count: number;
    }>(`queue?${new URLSearchParams({ ...filters, page: String(page) })}`)
      .then((data) => {
        if (live) {
          setItems(data.contributions);
          setFeatures(data.features);
          setCount(data.count);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [filters, page, version]);
  if (selected)
    return (
      <ModerationDetail
        key={selected.id}
        item={selected}
        onClose={() => setSelected(undefined)}
        onDone={() => {
          setSelected(undefined);
          setMessage(
            "Decision saved. Accepted material is now in the Published Panel.",
          );
          setVersion((v) => v + 1);
        }}
      />
    );
  return (
    <>
      <h2>Review queue</h2>
      <ContributionFilters
        value={filters}
        onChange={(v) => {
          setFilters(v);
          setPage(0);
        }}
        features={features}
      />
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading review queue…</p>
      ) : items.length ? (
        items.map((item) => (
          <ContributionCard
            key={item.id}
            item={item}
            onReview={() => setSelected(item)}
          />
        ))
      ) : (
        <p>No contributions match these filters.</p>
      )}
      <div className="op-actions">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={(page + 1) * 25 >= count}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
function RoleManagement() {
  const [profiles, setProfiles] = useState<
    { id: string; display_name: string; role: Role }[]
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ profiles: typeof profiles }>("profiles")
      .then((data) => setProfiles(data.profiles))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <details className="op-history">
      <summary>Administrator / account roles</summary>
      <p>
        Only administrators can grant roles. Each change is recorded in the role
        audit.
      </p>
      <form
        className="op-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          try {
            await api("role", values);
            setMessage("Role updated.");
            const data = await api<{ profiles: typeof profiles }>("profiles");
            setProfiles(data.profiles);
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Account
          <select name="id" required>
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.display_name} · {p.role} · {p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label>
          New role
          <select name="role">
            {["member", "contributor", "moderator", "admin"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <button disabled={busy || !profiles.length}>Update role</button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
