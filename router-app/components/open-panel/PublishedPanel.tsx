import { Link } from "react-router";
import {
  splitCredits,
  safeMedia,
  safeUrl,
  type Credit,
  type PanelData,
  type Addition,
  type Revision,
  type PanelCitation,
  additionLabel,
} from "../../lib/open-panel";
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
        <b className="editorial-marker">
          COMMUNITY EDITION · REVISION {data?.feature.current_revision ?? 1}
        </b>
        <span>
          Last revised{" "}
          {data
            ? new Date(data.feature.updated_at).toLocaleDateString("en-GB", {
                timeZone: "UTC",
              })
            : "10 September 2026"}
        </span>
        <span>
          Built from the original feature and {data?.additions.length ?? 0}{" "}
          published community contributions.
        </span>
      </div>
      <Link
        className="op-button action-primary"
        to={
          open ? `/features/${slug}/workshop` : `/features/${slug}/correction`
        }
      >
        {open ? "OPEN THE WORKSHOP" : "REPORT A CORRECTION"} ↗
      </Link>
      <ContributorCredits credits={data?.credits ?? []} />
    </section>
  );
}
export function CommunityAdditions({
  additions,
  citations = [],
}: {
  additions: Addition[];
  citations?: PanelCitation[];
}) {
  return (
    <section className="op-additions" aria-labelledby="community-heading">
      <p className="op-eyebrow">CURATED / CREDITED / PUBLISHED</p>
      <h2 id="community-heading">Community Additions</h2>
      {!additions.length ? (
        <div className="op-empty-panel">
          <b>THIS PANEL IS OPEN</b>
          <p>
            No community additions have been published yet. Bring a correction,
            strategy, source, experience or different perspective and help
            develop the next revision.
          </p>
          <Link className="op-button action-primary" to="#workshop-link">
            ADD TO THIS EDITORIAL →
          </Link>
          <small>
            Your contribution will enter the private Workshop for editorial
            review. Published additions receive a permanent Panel Citation.
          </small>
        </div>
      ) : (
        additions.map((a) => (
          <article key={a.id} className="op-addition">
            <p className="op-eyebrow">
              FROM THE OPEN PANEL ·{" "}
              {additionLabel(
                citations.find((c) => c.contribution_id === a.contribution_id)
                  ?.contribution_type ?? "",
              )}
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
              Contributed by{" "}
              {a.contributor?.display_name ?? "Anonymous Panelist"} · Published
              Contributor · Edited into Revision {a.revision_number} ·{" "}
              <PanelCitationDisclosure
                citation={citations.find(
                  (c) => c.contribution_id === a.contribution_id,
                )}
              />
            </small>
          </article>
        ))
      )}
    </section>
  );
}
export function PanelCitationDisclosure({
  citation,
}: {
  citation?: PanelCitation;
}) {
  if (!citation) return null;
  return (
    <details className="panel-citation">
      <summary>
        [P//{String(citation.revision_number).padStart(2, "0")}]
      </summary>
      <dl>
        <dt>Credit</dt>
        <dd>{citation.public_credit}</dd>
        <dt>Contribution</dt>
        <dd>{citation.contribution_type}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(citation.submitted_at).toLocaleDateString("en-GB")}</dd>
        <dt>Reviewed by</dt>
        <dd>{citation.reviewing_editor}</dd>
        <dt>Published</dt>
        <dd>{new Date(citation.published_at).toLocaleDateString("en-GB")}</dd>
        <dt>Editorial change</dt>
        <dd>{citation.editorial_summary}</dd>
        {citation.source_url && (
          <>
            <dt>Evidence</dt>
            <dd>
              <a
                href={citation.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Supporting source ↗
              </a>
            </dd>
          </>
        )}
      </dl>
    </details>
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
