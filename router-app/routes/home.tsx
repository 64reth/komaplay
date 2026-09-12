import { Link } from "react-router";
import type { Route } from "./+types/home";
import { catalogue } from "../lib/publication.server";
import {
  filterFeatures,
  orderedDrops,
  type DiscoveryFilters,
} from "../lib/publication";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { CurrentIssueHeader } from "../components/CurrentIssueHeader";
import { IssueFilters } from "../components/IssueFilters";
import { WeeklyDropStrip } from "../components/publication/WeeklyDropStrip";
import { ClosingPanels } from "../components/publication/ClosingPanels";
export async function loader({ request }: Route.LoaderArgs) {
  const data = await catalogue();
  const filters = Object.fromEntries(
    new URL(request.url).searchParams,
  ) as DiscoveryFilters;
  return { data, filters };
}
export const meta: Route.MetaFunction = () => [
  { title: "KOMA://PLAY — Issue Zero" },
  {
    name: "description",
    content: "A living publication for games, manga and anime.",
  },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com" },
];
export default function Home({ loaderData }: Route.ComponentProps) {
  const { data, filters } = loaderData;
  const issue =
    data.issues.find((i) => i.status === "current") ??
    data.issues.find((i) => i.status === "finalising");
  if (!issue)
    return (
      <main className="editorial-page">
        <Masthead />
        <IssueNavigation />
        <section className="op-workspace">
          <h1>
            {data.message
              ? "Publication temporarily unavailable."
              : "The next issue is taking shape."}
          </h1>
          {data.message && (
            <p className="op-notice" role="status">
              {data.message}
            </p>
          )}
          <Link to="/archive">Enter the archive →</Link>
        </section>
      </main>
    );
  const features = filterFeatures(data, { ...filters, issue: issue.slug });
  const drops = orderedDrops(
    data.drops.filter((d) => d.issue_id === issue.id),
    true,
  );
  return (
    <main className="editorial-page issue-home">
      <Masthead />
      <IssueNavigation />
      <CurrentIssueHeader issue={issue} categories={data.categories} />
      <IssueFilters selected={filters.filter} />
      {data.message && (
        <p className="publication-setup" role="status">
          {data.message}
        </p>
      )}
      {drops.map((drop, i) => (
        <WeeklyDropStrip
          key={drop.id}
          data={data}
          drop={drop}
          features={features}
          quiet={i > 0}
        />
      ))}
      <ClosingPanels data={data} features={features} />
      <Link className="archive-entry" to="/archive">
        <span>EVERY ISSUE. EVERY REVISION.</span>
        <b>ENTER THE ARCHIVE →</b>
      </Link>
      <footer className="op-footer">
        <span>New panels every week. New issues every month.</span>
        <Link to="/features/time">Read the first panel →</Link>
      </footer>
      <footer className="site-handbook-footer">
        <Link to="/handbook">COMMUNITY HANDBOOK</Link>
      </footer>
    </main>
  );
}
