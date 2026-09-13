import { Link, useLocation } from "react-router";
export function IssueNavigation() {
  const { pathname } = useLocation();
  return (
    <div className="issue-navigation">
      <Link
        className="active-underline"
        to="/"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        Current issue
      </Link>
      <Link
        className="active-underline"
        to="/archive"
        aria-current={pathname === "/archive" ? "page" : undefined}
      >
        Archive
      </Link>
      <Link
        className="active-underline"
        to="/about"
        aria-current={pathname === "/about" ? "page" : undefined}
      >
        About
      </Link>
      <form action="/search" role="search">
        <label className="sr-only" htmlFor="global-search">
          Search KOMA://PLAY
        </label>
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="Find a panel…"
        />
        <button type="submit">Search ↗</button>
      </form>
    </div>
  );
}
