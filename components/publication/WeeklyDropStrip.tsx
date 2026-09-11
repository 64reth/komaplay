import { FeatureStrip } from "../FeatureStrip";
import {
  stripItems,
  acceptsContributions,
  type Catalogue,
  type Drop,
  type Feature,
} from "../../lib/publication/domain";
export function WeeklyDropStrip({
  data,
  drop,
  features = data.features,
  quiet = false,
}: {
  data: Catalogue;
  drop: Drop;
  features?: Feature[];
  quiet?: boolean;
}) {
  const items = stripItems(data, drop, features);
  const issue = data.issues.find((i) => i.id === drop.issue_id);
  const open = features.filter(
    (f) =>
      f.weekly_drop_id === drop.id &&
      issue &&
      acceptsContributions(f, issue, data.now),
  ).length;
  return (
    <section
      className={`weekly-drop ${quiet ? "quiet-drop" : ""}`}
      aria-label={drop.label}
    >
      <div className="weekly-heading">
        <div>
          <p className="op-eyebrow">
            WEEK {String(drop.week_number).padStart(2, "0")} /{" "}
            <time
              dateTime={drop.published_at ?? drop.scheduled_at ?? undefined}
            >
              {drop.published_at
                ? new Date(drop.published_at).toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                  })
                : drop.status === "scheduled"
                  ? "Scheduled"
                  : "Draft preview"}
            </time>
          </p>
          <h2>{drop.label}</h2>
          {drop.introduction && <p>{drop.introduction}</p>}
        </div>
        <span className="op-eyebrow">
          {items.length} FEATURES ·{" "}
          {open ? `${open} OPEN PANELS` : "FINAL PANELS"}
        </span>
      </div>
      {items.length ? (
        <FeatureStrip items={items} label={drop.label} />
      ) : (
        <p className="op-notice">
          No features in this drop match the selected filters.
        </p>
      )}
    </section>
  );
}
