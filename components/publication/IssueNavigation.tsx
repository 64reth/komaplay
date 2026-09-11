"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function IssueNavigation() {
  const pathname = usePathname();
  return (
    <div className="issue-navigation">
      <Link
        className="active-underline"
        href="/"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        Current issue
      </Link>
      <Link
        className="active-underline"
        href="/archive"
        aria-current={pathname === "/archive" ? "page" : undefined}
      >
        Archive
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
        <button>Search ↗</button>
      </form>
    </div>
  );
}
