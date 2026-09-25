import { Link } from "react-router";
import { publicCoverArt, type Catalogue, type Issue } from "../../lib/publication";
export function ArchiveIssueCard({
  issue,
  data,
}: {
  issue: Issue;
  data: Catalogue;
}) {
  const features = data.features.filter((f) => f.issue_id === issue.id);
  const contributors = new Set(
    data.credits
      .filter((c) => features.some((f) => f.id === c.feature_id))
      .map((c) => c.contributor_id),
  );
  return (
    <Link className="archive-issue" to={`/issues/${issue.slug}`}>
      <span className="op-eyebrow">
        {new Date(Date.UTC(issue.year, issue.month - 1)).toLocaleDateString(
          "en-GB",
          { month: "long", year: "numeric", timeZone: "UTC" },
        )}
      </span>
      <span className={`archive-cover archive-cover-${issue.cover_preset}`}>
        {issue.cover_art && <img src={publicCoverArt(issue.cover_art)} alt={issue.cover_art_alt}/>}<span className="archive-cover-masthead">KOMA://PLAY</span><span className="archive-cover-number">ISSUE {String(issue.issue_number).padStart(2, "0")}</span><strong>{issue.lead_headline||issue.title}</strong>{issue.cover_theme&&<em>{issue.cover_theme}</em>}
      </span>
      <h3>{issue.title}</h3>
      <p>{issue.subtitle}</p>
      <small>
        {features.length} features / {contributors.size} contributors
      </small>
      <small>
        Finalised{" "}
        {issue.archived_at
          ? new Date(issue.archived_at).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })
          : "—"}
      </small>
      <b>{issue.cover_label || "READ THE ISSUE"} ↗</b>
    </Link>
  );
}
export function ArchiveShelf({
  issues,
  data,
}: {
  issues: Issue[];
  data: Catalogue;
}) {
  const years = [...new Set(issues.map((i) => i.year))].sort((a, b) => b - a);
  return (
    <>
      {years.length ? (
        years.map((year) => (
          <section key={year} className="archive-year">
            <h2>{year}</h2>
            <div className="archive-shelf">
              {issues
                .filter((i) => i.year === year)
                .map((issue) => (
                  <ArchiveIssueCard key={issue.id} issue={issue} data={data} />
                ))}
            </div>
          </section>
        ))
      ) : (
        <p className="op-notice">No archived issues match these filters.</p>
      )}
    </>
  );
}
