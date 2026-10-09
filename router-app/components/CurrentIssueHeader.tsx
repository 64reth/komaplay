import {homeIssueLabel} from "../lib/home-publication";
import { Link } from "react-router";
import type { Issue, Taxonomy } from "../lib/publication";
export function CurrentIssueHeader({
  issue,
  categories,
  selected,
}: {
  issue?: Issue;
  categories: Taxonomy[];
  selected?: string;
}) {
  return (
    <section className="cover-brand issue-masthead">
      <p className="editorial-marker">
        {issue?.subtitle || "A LIVING PUBLICATION FOR GAMES / MANGA / ANIME"}
      </p>
      <h1 aria-label="KOMA://PLAY">
        <span aria-hidden="true">KOMA</span>
        <i aria-hidden="true">:</i>
        <span aria-hidden="true">//PLAY</span>
      </h1>
      <small className="text-accent">
        {homeIssueLabel(issue)}
      </small>
      <nav aria-label="Categories">
        {categories.map((c) => (
          <Link key={c.id} to={`/?category=${c.slug}`} aria-current={selected === c.slug ? "page" : undefined}>
            {c.name}
          </Link>
        ))}
      </nav>
    </section>
  );
}
