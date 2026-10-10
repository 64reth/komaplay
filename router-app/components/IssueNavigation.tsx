import { Link, useLocation } from "react-router";
import type { Issue } from "../lib/publication";

export function IssueNavigation({issue}: {issue?: Pick<Issue, "status">} = {}) {
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  return (
    <div className="issue-navigation">
      <Link
        className="active-underline"
        to="/"
        aria-current={pathname === "/" ? "page" : issue && ["current", "finalising"].includes(issue.status) ? "location" : undefined}
      >
        Current issue
      </Link>
      <Link
        className="active-underline"
        to="/archive"
        aria-current={pathname === "/archive" ? "page" : issue?.status === "archived" ? "location" : undefined}
      >
        Archive
      </Link>
      <form action="/search" role="search">
        <label className="sr-only" htmlFor="global-search">
          Search KOMA://PLAY
        </label>
        <input
          key={`${pathname}:${query}`}
          defaultValue={query}
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
