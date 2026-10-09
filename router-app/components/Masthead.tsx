import { Link } from "react-router";
import { AccountNav } from "./AccountNav";

import type { Issue } from "../lib/publication";

export function Masthead({issue, issueLabel}: { slug?: string; issue?: Pick<Issue, "issue_number">; issueLabel?:string }) {
  const label = issue ? `ISSUE ${String(issue.issue_number).padStart(2, "0")}` : issueLabel ?? "PUBLICATION";
  return (
    <header className="editorial-nav">
      <Link className="wordmark" to="/">
        KOMA://PLAY
      </Link>
      <span>{label}</span>
      <Link to="/about">ABOUT</Link>
      <AccountNav />
    </header>
  );
}
