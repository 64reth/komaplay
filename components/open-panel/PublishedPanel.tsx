import {
  splitCredits,
  safeMedia,
  safeUrl,
  type Credit,
  type PanelData,
  type Addition,
  type Revision,
} from "../../lib/open-panel/domain";
export function ContributorCredits({ credits }: { credits: Credit[] }) {
  const { visible, extra } = splitCredits(credits);
  return (
    <div className="op-credits">
      <span>Open Panel contributors: </span>
      {visible.length
        ? visible.map((c) => c.display_name).join(", ")
        : "No published community credits yet."}
      {extra.length > 0 && (
        <details>
          <summary>+ {extra.length} more</summary>
          <ul>
            {extra.map((c) => (
              <li key={c.id}>{c.display_name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
export function OpenPanelStatus({
  data,
  slug,
  open = true,
}: {
  data: PanelData | null;
  slug: string;
  open?: boolean;
}) {
  return (
    <section className="op-status" aria-label="Open Panel status">
      <div>
        <b>{open ? "OPEN PANEL" : "FINAL PANEL"}</b>
        <span>Revision {data?.feature.current_revision ?? 1}</span>
        <span>
          Last revised{" "}
          {data
            ? new Date(data.feature.updated_at).toLocaleDateString("en-GB", {
                timeZone: "UTC",
              })
            : "10 September 2026"}
        </span>
        <span>{data?.additions.length ?? 0} accepted contributions</span>
      </div>
      <a
        className="op-button"
        href={`/features/${slug}/${open ? "workshop" : "correction"}`}
      >
        {open ? "Enter the Workshop" : "Report a Correction"} ↗
      </a>
      <ContributorCredits credits={data?.credits ?? []} />
    </section>
  );
}
export function CommunityAdditions({ additions }: { additions: Addition[] }) {
  return (
    <section className="op-additions" aria-labelledby="community-heading">
      <p className="op-eyebrow">CURATED / CREDITED / PUBLISHED</p>
      <h2 id="community-heading">Community Additions</h2>
      {!additions.length ? (
        <p>No community additions have been published for this Panel.</p>
      ) : (
        additions.map((a) => (
          <article key={a.id} className="op-addition">
            <p className="op-eyebrow">
              {a.target_section} / REVISION {a.revision_number}
            </p>
            <h3>{a.heading}</h3>
            <p className="op-prose">{a.body}</p>
            {a.screenshot_path && (
              <figure>
                <img
                  className="op-screenshot"
                  src={`/api/open-panel/image?path=${encodeURIComponent(a.screenshot_path)}`}
                  alt={`Published screenshot: ${a.heading}`}
                />
              </figure>
            )}
            {a.source_url && safeUrl(a.source_url) && (
              <p>
                <a
                  href={a.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Supporting source ↗
                </a>
              </p>
            )}
            {a.media_url && safeMedia(a.media_url) && (
              <p>
                <a href={a.media_url} target="_blank" rel="noopener noreferrer">
                  Watch on {new URL(a.media_url).hostname} ↗
                </a>
              </p>
            )}
            <small>
              Contributed by {a.contributor?.display_name ?? "Reader"}
            </small>
          </article>
        ))
      )}
    </section>
  );
}
export function RevisionHistory({
  revisions,
  credits,
}: {
  revisions: Revision[];
  credits: Credit[];
}) {
  return (
    <details className="op-history">
      <summary>Revision history ({revisions.length || 1})</summary>
      {revisions.length ? (
        revisions.map((r) => (
          <article key={r.id}>
            <b>
              Revision {r.revision_number} ·{" "}
              {new Date(r.created_at).toLocaleDateString("en-GB", {
                timeZone: "UTC",
              })}
            </b>
            <p>{r.summary}</p>
            <small>
              {r.contributor_ids
                .map(
                  (id) =>
                    credits.find((c) => c.id === id)?.display_name ?? "Reader",
                )
                .join(", ")}
            </small>
          </article>
        ))
      ) : (
        <p>Revision 1 · Original editorial edition.</p>
      )}
    </details>
  );
}
