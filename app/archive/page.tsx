import { catalogue } from "../../lib/publication/server";
import {
  archiveIssues,
  type DiscoveryFilters,
} from "../../lib/publication/domain";
import { EditorialHeader } from "../../components/EditorialNavigation";
import { IssueNavigation } from "../../components/publication/IssueNavigation";
import { DiscoveryForm } from "../../components/publication/IssueFilters";
import { ArchiveShelf } from "../../components/publication/ArchiveShelf";
export const dynamic = "force-dynamic";
export default async function Archive({
  searchParams,
}: {
  searchParams: Promise<DiscoveryFilters>;
}) {
  const filters = await searchParams;
  const data = await catalogue();
  return (
    <main className="editorial-page">
      <EditorialHeader />
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
