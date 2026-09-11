import {
  deadline,
  panelState,
  type Feature,
  type Issue,
} from "../../lib/publication/domain";
export function OpenPanelCountdown({
  feature,
  issue,
  now,
}: {
  feature: Feature;
  issue: Issue;
  now: string;
}) {
  const state = panelState(feature, issue, now);
  const end = deadline(feature, issue);
  const days = Math.max(
    0,
    Math.ceil((Date.parse(end) - Date.parse(now)) / 86400000),
  );
  return (
    <span className="panel-countdown">
      {state === "draft" ? (
        "DRAFT"
      ) : state === "final_panel" || state === "archived" ? (
        <>
          FINAL PANEL · CLOSED{" "}
          <time dateTime={end}>
            {new Date(end)
              .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })
              .toUpperCase()}
          </time>
        </>
      ) : (
        <>
          {state === "closing_panel" ? "CLOSING PANEL" : "OPEN PANEL"} · {days}{" "}
          {days === 1 ? "DAY" : "DAYS"} REMAINING{" "}
          <span className="sr-only">
            Deadline {new Date(end).toUTCString()}
          </span>
        </>
      )}
    </span>
  );
}
