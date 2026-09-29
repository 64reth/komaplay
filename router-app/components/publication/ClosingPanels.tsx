import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
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
  closing.sort((a,b)=>Date.parse(a.deadline_override??data.issues.find(i=>i.id===a.issue_id)?.closes_at??"")-Date.parse(b.deadline_override??data.issues.find(i=>i.id===b.issue_id)?.closes_at??"")||a.strip_position-b.strip_position||a.id.localeCompare(b.id));
  if (!closing.length) return null;
  return (
    <section className="closing-panels">
      <h2>PANELS CLOSING THIS WEEK</h2>
      {closing.slice(0,3).map((f) => (
        <Link to={`/features/${f.slug}/workshop`} key={f.id}>
          <b>{f.title}</b>
          <OpenPanelCountdown
            feature={f}
            issue={data.issues.find((i) => i.id === f.issue_id)!}
            now={data.now}
          />
          <span className="closing-panel-arrow" aria-hidden="true">
            <ArrowUpRight className="koma-icon" />
          </span>
        </Link>
      ))}
      {closing.length>3&&<Link to="/?filter=open">VIEW ALL OPEN PANELS →</Link>}
    </section>
  );
}
