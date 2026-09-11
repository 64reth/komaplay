import Link from "next/link";
import type { Catalogue, DiscoveryFilters } from "../../lib/publication/domain";
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
          href={key === "latest" ? "/" : `/?filter=${key}`}
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
          {data.categories.map((c) => (
            <option value={c.slug} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Format
        <select name="format" defaultValue={filters.format ?? ""}>
          <option value="">All formats</option>
          {data.formats.map((f) => (
            <option value={f.slug} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Series / topic
        <select name="tag" defaultValue={filters.tag ?? ""}>
          <option value="">All topics</option>
          {data.tags.map((t) => (
            <option value={t.slug} key={t.id}>
              {t.name}
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
              {data.issues.map((i) => (
                <option value={i.slug} key={i.id}>
                  {i.title}
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
