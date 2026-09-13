import { Link } from "react-router";
import type { Route } from "./+types/archive";
import { catalogue } from "../lib/publication.server";
import { archiveIssues, type DiscoveryFilters } from "../lib/publication";
import { PanelDirectory, type PanelDirectoryRow } from "../components/PanelDirectory";
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
  const archivedPanels = data.features.filter((feature) => feature.lifecycle_status === "archived" && !feature.issue_id);
  const panelRows: PanelDirectoryRow[] = archivedPanels.map((feature) => {
    const issue = data.issues.find((item) => item.id === feature.issue_id);
    const category = data.categories.find((item) => item.id === feature.category_id);
    const format = data.formats.find((item) => item.id === feature.format_id);
    return {
      id: feature.id,
      title: feature.title,
      type: `${category?.name ?? "Feature"} / ${format?.name ?? "Editorial"}`,
      status: "Archived",
      date: feature.archived_at ? new Date(feature.archived_at).toLocaleDateString("en-GB") : new Date(feature.updated_at).toLocaleDateString("en-GB"),
      meta: `${issue?.title ?? "Archive"} · ${feature.published_at ? `Published ${new Date(feature.published_at).toLocaleDateString("en-GB")}` : "Published panel"}`,
      action: <Link to={`/features/${feature.slug}`}>READ →</Link>,
    };
  });
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
        <section>
          <h2>Loose archived panels</h2>
          <PanelDirectory label="Loose archived panels" rows={panelRows} empty="No archived panels yet." />
        </section>
      </div>
    </main>
  );
}
