import Link from "next/link";
import { OpenPanelCountdown } from "../publication/OpenPanelCountdown";
import type { Feature, Issue } from "../../lib/publication/domain";

export function WorkshopHeader({
  feature,
  issue,
  now,
  open,
  role,
}: {
  feature: Feature;
  issue: Issue;
  now: string;
  open: boolean;
  role?: string;
}) {
  return (
    <header className="workshop-header">
      <Link className="workshop-back" href={`/features/${feature.slug}`}>
        ← RETURN TO COMMUNITY EDITION
      </Link>
      <p className="op-eyebrow">OPEN PANEL WORKSHOP</p>
      <h1>{feature.title}</h1>
      <p className="workshop-revision">
        BUILDING REVISION {feature.current_revision + 1} ·{" "}
        <OpenPanelCountdown feature={feature} issue={issue} now={now} />
      </p>
      <p className="workshop-purpose">
        {open
          ? "A focused member space to strengthen this editorial with evidence, experience and useful corrections."
          : "This Panel is closed. Your submissions and their decisions remain available below."}
      </p>
      <nav className="workshop-utilities" aria-label="Workshop utilities">
        <span>MEMBER UTILITIES</span>
        <Link href="/profile">PROFILE</Link>
        <Link href="/handbook">COMMUNITY HANDBOOK</Link>
        {role === "moderator" || role === "admin" ? (
          <Link href="/moderation">MODERATION</Link>
        ) : null}
        {role === "admin" ? <Link href="/publishing">PUBLISHING</Link> : null}
      </nav>
      <p className="workshop-flow-status" role="status">
        DRAFT · LIVE SOURCE · READY FOR PANEL
      </p>
      {!open && (
        <Link
          className="op-button"
          href={`/features/${feature.slug}/correction`}
        >
          REPORT A PRIVATE CORRECTION ↗
        </Link>
      )}
    </header>
  );
}
