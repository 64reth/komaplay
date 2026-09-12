import { Link } from "react-router";
import type { Catalogue, DiscoveryFilters } from "../lib/publication";
export function IssueFilters({ selected = "latest" }: { selected?: string }) {
  return (
    <nav className="issue-filters" aria-label="Quick issue filters">
      {[
        ["latest", "Latest"],
        ["gaming", "Gaming"],
        ["anime-manga", "Anime + Manga"],
        ["guides", "Guides"],
        ["open", "Open Panels"],
      ].map(([key, label]) => (
        <Link
          key={key}
          to={key === "latest" ? "/" : `/?filter=${key}`}
          aria-current={selected === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function DiscoveryForm({
  data,
  filters,
  archive = false,
}: {
  data: Catalogue;
  filters: DiscoveryFilters;
  archive?: boolean;
}) {
  return (
    <form className="discovery-form" action={archive ? "/archive" : "/search"}>
      <label>
        Search
        <input name="q" type="search" defaultValue={filters.q} />
      </label>
      <label>
        Category
        <select name="category" defaultValue={filters.category ?? ""}>
          <option value="">All categories</option>
          {data.categories.map((x) => (
            <option key={x.id} value={x.slug}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Format
        <select name="format" defaultValue={filters.format ?? ""}>
          <option value="">All formats</option>
          {data.formats.map((x) => (
            <option key={x.id} value={x.slug}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Series / topic
        <select name="tag" defaultValue={filters.tag ?? ""}>
          <option value="">All topics</option>
          {data.tags.map((x) => (
            <option key={x.id} value={x.slug}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {archive ? (
        <label>
          Contributor
          <select name="contributor" defaultValue={filters.contributor ?? ""}>
            <option value="">All contributors</option>
            {data.profiles
              .filter((p) =>
                data.credits.some((c) => c.contributor_id === p.id),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            Issue
            <select name="issue" defaultValue={filters.issue ?? ""}>
              <option value="">All issues</option>
              {data.issues.map((x) => (
                <option key={x.id} value={x.slug}>
                  {x.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Panel status
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">All panels</option>
              <option value="open">Open Panels</option>
              <option value="closed">Final / Archived Panels</option>
            </select>
          </label>
        </>
      )}
      <button>Apply filters →</button>
    </form>
  );
}
