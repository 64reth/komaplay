import { Link } from "react-router";
import type { personalBriefing } from "../lib/briefing.server";
import { acceptsContributions, type Catalogue } from "../lib/publication";
type Briefing = NonNullable<
  Awaited<ReturnType<typeof personalBriefing>>["briefing"]
>;
export function PersonalBriefing({
  briefing,
  data,
}: {
  briefing: Briefing;
  data: Catalogue;
}) {
  const find = (id: string) => data.features.find((f) => f.id === id);
  const relevant = data.features
    .filter((f) =>
      briefing.preferences.some((p) =>
        data.categories.some((c) => c.id === f.category_id && c.slug === p),
      ),
    )
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, 3);
  const open = data.features
    .filter((f) => {
      const i = data.issues.find((i) => i.id === f.issue_id);
      return i && acceptsContributions(f, i, data.now);
    })
    .slice(0, 2);
  return (
    <section className="personal-briefing" aria-label="Your editorial briefing">
      <div className="briefing-heading">
        <h2>YOUR KOMA BRIEFING</h2>
        <Link to="/profile#inbox">
          INBOX{briefing.unread ? ` · ${briefing.unread} UNREAD` : ""} →
        </Link>
      </div>
      {briefing.unavailable && (
        <p role="status">
          Some private updates could not load. Your work is retained; open
          Profile to retry.
        </p>
      )}
      <div className="briefing-grid">
        <div>
          <h3>CONTINUE</h3>
          {briefing.drafts.map((d) => {
            const f = find(d.feature_id);
            return (
              <p key={d.id}>
                <Link
                  to={
                    f
                      ? `/features/${f.slug}/workshop?draft=${d.id}`
                      : "/profile"
                  }
                >
                  {d.title} →
                </Link>
              </p>
            );
          })}
          {briefing.editorial.map((e) => (
            <p key={e.feature_id}>
              <Link to={`/editorial?feature=${e.feature_id}`}>{e.title} →</Link>
            </p>
          ))}
          {!briefing.drafts.length && !briefing.editorial.length && (
            <p>No unfinished writing. Explore an Open Panel below.</p>
          )}
          {briefing.saved.length > 0 && (
            <p>
              <Link to="/profile#saved">YOUR SAVED PANELS →</Link>
            </p>
          )}
        </div>
        <div>
          <h3>
            {relevant.length ? "IN YOUR INTERESTS" : "OPEN FOR CONTRIBUTIONS"}
          </h3>
          {(relevant.length ? relevant : open).map((f) => (
            <p key={f.id}>
              <Link to={`/features/${f.slug}`}>{f.title} →</Link>
            </p>
          ))}
          <Link to="/search?status=open">ALL OPEN PANELS →</Link>
          {!briefing.chosen && (
            <p>
              <Link to="/profile/settings?welcome=1">
                CHOOSE INTERESTS / SKIP →
              </Link>
            </p>
          )}
          {briefing.chosen && (
            <p>
              <Link to="/profile/settings">EDIT INTERESTS →</Link>
            </p>
          )}
        </div>
      </div>
      {briefing.events.length > 0 && (
        <details>
          <summary>Recent editorial updates</summary>
          {briefing.events.map((e) => (
            <p key={e.id}>
              {e.message} <Link to="/profile#inbox">OPEN INBOX →</Link>
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
