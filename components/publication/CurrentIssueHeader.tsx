import Link from "next/link";
import type { Issue, Taxonomy } from "../../lib/publication/domain";
export function CurrentIssueHeader({
  issue,
  categories,
}: {
  issue: Issue;
  categories: Taxonomy[];
}) {
  return (
    <section className="cover-brand issue-masthead">
      <p>
        {issue.subtitle || "A LIVING PUBLICATION FOR GAMES / MANGA / ANIME"}
      </p>
      <h1>
        INK//<i>:</i>PLAY
      </h1>
      <small>
        ISSUE {String(issue.issue_number).padStart(2, "0")} /{" "}
        {new Date(Date.UTC(issue.year, issue.month - 1))
          .toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })
          .toUpperCase()}
      </small>
      <nav aria-label="Categories">
        {categories.map((c) => (
          <Link key={c.id} href={`/?category=${c.slug}`}>
            {c.name}
          </Link>
        ))}
      </nav>
    </section>
  );
}
