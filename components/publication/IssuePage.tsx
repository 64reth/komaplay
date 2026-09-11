import {
  orderedDrops,
  issueState,
  type Catalogue,
  type Issue,
} from "../../lib/publication/domain";
import { CurrentIssueHeader } from "./CurrentIssueHeader";
import { WeeklyDropStrip } from "./WeeklyDropStrip";
export function IssueStatusBadge({
  issue,
  now,
}: {
  issue: Issue;
  now: string;
}) {
  return (
    <span className="op-badge">{issueState(issue, now).toUpperCase()}</span>
  );
}
export function IssuePage({ issue, data }: { issue: Issue; data: Catalogue }) {
  const features = data.features.filter((f) => f.issue_id === issue.id);
  const ids = new Set(
    data.credits
      .filter((c) => features.some((f) => f.id === c.feature_id))
      .map((c) => c.contributor_id),
  );
  return (
    <>
      <CurrentIssueHeader issue={issue} categories={data.categories} />
      <div className="issue-introduction">
        <IssueStatusBadge issue={issue} now={data.now} />
        <h2>{issue.title}</h2>
        <p>{issue.introduction}</p>
        <p>
          {features.length} features · {ids.size} credited contributors ·{" "}
          {features.reduce((sum, f) => sum + f.current_revision, 0)} total
          published revision numbers
        </p>
        {ids.size > 0 && (
          <p>
            Contributors:{" "}
            {data.profiles
              .filter((p) => ids.has(p.id))
              .map((p) => p.display_name)
              .join(", ")}
          </p>
        )}
      </div>
      {orderedDrops(data.drops.filter((d) => d.issue_id === issue.id)).map(
        (drop, i) => (
          <WeeklyDropStrip
            key={drop.id}
            data={data}
            drop={drop}
            quiet={i > 0}
          />
        ),
      )}
    </>
  );
}
