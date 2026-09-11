"use client";
import { useEffect, useState } from "react";
import type { HandbookVersion } from "../../lib/handbook/domain";
type ManagerData = {
  versions: HandbookVersion[];
  counts: { handbook_version_id: string; acceptance_count: number }[];
  error?: string;
};
export function HandbookManager() {
  const [versions, setVersions] = useState<HandbookVersion[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = () =>
    fetch("/api/handbook/versions", { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as ManagerData;
        if (!r.ok) throw new Error(d.error);
        setVersions(d.versions);
        setCounts(
          Object.fromEntries(
            (d.counts ?? []).map((v) => [
              v.handbook_version_id,
              v.acceptance_count,
            ]),
          ),
        );
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="handbook-manager">
      <h2>Handbook versions</h2>
      <p>
        Versions are prepared through source-controlled migration files. This
        desk can preview and activate a prepared version.
      </p>
      {error && <p role="alert">{error}</p>}
      {versions.map((version) => (
        <article key={version.id}>
          <p className="op-eyebrow">
            {version.active ? "ACTIVE" : "PREPARED"} · {counts[version.id] ?? 0}{" "}
            ACCEPTANCES
          </p>
          <h3>{version.label}</h3>
          <p>
            Published{" "}
            {new Date(version.published_at).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })}
          </p>
          <details>
            <summary>Preview approved copy</summary>
            <pre>{version.content}</pre>
          </details>
          {!version.active && (
            <button
              disabled={busy === version.id}
              onClick={async () => {
                setBusy(version.id);
                setError("");
                try {
                  const r = await fetch("/api/handbook/activate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: version.id }),
                  });
                  const d = (await r.json()) as { error?: string };
                  if (!r.ok) throw new Error(d.error);
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === version.id ? "Activating…" : "Activate this version"}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
