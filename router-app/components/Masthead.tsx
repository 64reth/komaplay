import { Link } from "react-router";
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

      </nav>
      <AccountNav />
    </header>
  );
}
