import type { Route } from "./+types/archive";
import { catalogue } from "../lib/publication.server";
import { archiveIssues, type DiscoveryFilters } from "../lib/publication";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { DiscoveryForm } from "../components/IssueFilters";
import { ArchiveShelf } from "../components/publication/ArchiveShelf";
export async function loader({ request }: Route.LoaderArgs) {
  const data = await catalogue(),
    filters = Object.fromEntries(
      new URL(request.url).searchParams,
    ) as DiscoveryFilters;
  return { data, filters };
}
export const meta: Route.MetaFunction = () => [
  { title: "Archive — KOMA://PLAY" },
  { name: "description", content: "Completed issues and preserved panels." },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com/archive" },
];
export default function Archive({ loaderData }: Route.ComponentProps) {
  const { data, filters } = loaderData;
  return (
    <main className="editorial-page">
      <Masthead />
      <IssueNavigation />
      <div className="archive-page">
        <p className="op-eyebrow editorial-marker">THE PERMANENT COLLECTION</p>
        <h1>Archive</h1>
        <p>Completed issues. Preserved panels. Every contributor credited.</p>
        {data.message && <p className="op-notice">{data.message}</p>}
        <DiscoveryForm data={data} filters={filters} archive />
        <ArchiveShelf data={data} issues={archiveIssues(data, filters)} />
      </div>
    </main>
  );
}
