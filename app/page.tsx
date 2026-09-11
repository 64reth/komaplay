import Link from "next/link";
import { catalogue } from "../lib/publication/server";
import {
  filterFeatures,
  orderedDrops,
  type DiscoveryFilters,
} from "../lib/publication/domain";
import {
  EditorialHeader,
  EditorialKeyboard,
} from "../components/EditorialNavigation";
import { CurrentIssueHeader } from "../components/publication/CurrentIssueHeader";
import { IssueNavigation } from "../components/publication/IssueNavigation";
import { IssueFilters } from "../components/publication/IssueFilters";
import { WeeklyDropStrip } from "../components/publication/WeeklyDropStrip";
import { ClosingPanels } from "../components/publication/ClosingPanels";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<DiscoveryFilters>;
}) {
  const filters = await searchParams;
  const data = await catalogue();
  const issue =
    data.issues.find((i) => i.status === "current") ??
    data.issues.find((i) => i.status === "finalising");
  if (!issue)
    return (
      <main className="editorial-page">
        <EditorialHeader />
        <IssueNavigation />
        <div className="op-workspace">
          <h1>The next issue is taking shape.</h1>
          <p>
            {data.message ??
              "Explore the permanent archive while we prepare the next drop."}
          </p>
          <Link href="/archive">Enter the archive →</Link>
        </div>
      </main>
    );
  const features = filterFeatures(data, { ...filters, issue: issue.slug });
  const drops = orderedDrops(
    data.drops.filter((d) => d.issue_id === issue.id),
    true,
  );
  return (
    <main className="editorial-page issue-home">
      <EditorialHeader issueLabel={issue.title} />
      <EditorialKeyboard slug="cover" />
      <IssueNavigation />
      <CurrentIssueHeader issue={issue} categories={data.categories} />
      <IssueFilters selected={filters.filter} />
      {data.message && (
        <p className="publication-setup" role="status">
          {data.message}
        </p>
      )}
      {drops.length ? (
        drops.map((drop, i) => (
          <WeeklyDropStrip
            key={drop.id}
            data={data}
            drop={drop}
            features={features}
            quiet={i > 0}
          />
        ))
      ) : (
        <p className="op-notice">The first weekly drop is being prepared.</p>
      )}
      <ClosingPanels data={data} features={features} />
      <Link className="archive-entry" href="/archive">
        <span>EVERY ISSUE. EVERY REVISION.</span>
        <b>ENTER THE ARCHIVE →</b>
      </Link>
      <footer className="op-footer">
        <span>New panels every week. New issues every month.</span>
        <Link href="/features/time">Read the first panel →</Link>
      </footer>
    </main>
  );
}
