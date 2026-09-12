import { Link } from "react-router";
import type { Route } from "./+types/search";
import { catalogue } from "../lib/publication.server";
import { filterFeatures, type DiscoveryFilters } from "../lib/publication";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { DiscoveryForm } from "../components/IssueFilters";
import { OpenPanelCountdown } from "../components/publication/OpenPanelCountdown";
export async function loader({ request }: Route.LoaderArgs) {
  const data = await catalogue(),
    filters = Object.fromEntries(
      new URL(request.url).searchParams,
    ) as DiscoveryFilters;
  return { data, filters };
}
export const meta: Route.MetaFunction = () => [
  { title: "Search — KOMA://PLAY" },
  { name: "description", content: "Find a KOMA://PLAY panel." },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com/search" },
];
export default function Search({ loaderData }: Route.ComponentProps) {
  const { data, filters } = loaderData,
    features = filterFeatures(data, filters).sort(
      (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
    );
  return (
    <main className="editorial-page">
      <Masthead />
      <IssueNavigation />
      <div className="op-workspace">
        <p className="op-eyebrow editorial-marker">FIND YOUR NEXT PANEL</p>
        <h1>Search</h1>
        {data.message && <p className="op-notice">{data.message}</p>}
        <DiscoveryForm data={data} filters={filters} />
        <p role="status">{features.length} matching panels</p>
        {features.map((f) => {
          const issue = data.issues.find((i) => i.id === f.issue_id)!;
          return (
            <article className="search-panel" key={f.id}>
              <p className="op-eyebrow">
                {data.categories.find((c) => c.id === f.category_id)?.name} /{" "}
                {data.formats.find((x) => x.id === f.format_id)?.name} /{" "}
                {issue.title}
              </p>
              <h2>
                <Link to={`/features/${f.slug}`}>{f.title} ↗</Link>
              </h2>
              <p>{f.summary}</p>
              <OpenPanelCountdown feature={f} issue={issue} now={data.now} />
            </article>
          );
        })}
      </div>
    </main>
  );
}
