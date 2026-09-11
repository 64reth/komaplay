import Link from "next/link";
export function IssueNavigation() {
  return (
    <div className="issue-navigation">
      <Link href="/">Current issue</Link>
      <Link href="/archive">Archive</Link>
      <form action="/search" role="search">
        <label className="sr-only" htmlFor="global-search">
          Search INK//:PLAY
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
