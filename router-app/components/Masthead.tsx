import { Link } from "react-router";
import { issueZeroFeatures } from "../data/issue-zero";
import { AccountNav } from "./AccountNav";

export function Masthead({ slug }: { slug?: string }) {
  return (
    <header className="editorial-nav">
      <Link className="wordmark" to="/">
        KOMA://PLAY
      </Link>
      <span>ISSUE ZERO</span>
      <nav aria-label="Issue navigation">
        <Link to="/" aria-current={!slug ? "page" : undefined}>
          HOME
        </Link>
        <Link to="/about">
          ABOUT
        </Link>
        {issueZeroFeatures.map((feature) => (
          <Link
            key={feature.id}
            to={`/features/${feature.id}`}
            aria-label={`${String(feature.pageIndex).padStart(2, "0")} ${feature.title}`}
            aria-current={feature.id === slug ? "page" : undefined}
          >
            {String(feature.pageIndex).padStart(2, "0")}
          </Link>
        ))}
      </nav>
      <AccountNav />
    </header>
  );
}
