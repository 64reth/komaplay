import { Link } from "react-router";
import {
  panelState,
  type Catalogue,
  type Feature,
} from "../../lib/publication";
import { OpenPanelCountdown } from "./OpenPanelCountdown";
export function ClosingPanels({
  data,
  features,
}: {
  data: Catalogue;
  features: Feature[];
}) {
  const closing = features.filter((f) => {
    const issue = data.issues.find((i) => i.id === f.issue_id);
    return issue && panelState(f, issue, data.now) === "closing_panel";
  });
  if (!closing.length) return null;
  return (
    <section className="closing-panels">
      <h2>PANELS CLOSING THIS WEEK</h2>
      {closing.map((f) => (
        <Link to={`/features/${f.slug}/workshop`} key={f.id}>
          <b>{f.title}</b>
          <OpenPanelCountdown
            feature={f}
            issue={data.issues.find((i) => i.id === f.issue_id)!}
            now={data.now}
          />
          <span aria-hidden="true">↗</span>
        </Link>
      ))}
    </section>
  );
}
