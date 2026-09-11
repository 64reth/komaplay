import Link from "next/link";
import { catalogue } from "../../lib/publication/server";
import {
  filterFeatures,
  type DiscoveryFilters,
} from "../../lib/publication/domain";
import { EditorialHeader } from "../../components/EditorialNavigation";
import { IssueNavigation } from "../../components/publication/IssueNavigation";
import { DiscoveryForm } from "../../components/publication/IssueFilters";
import { OpenPanelCountdown } from "../../components/publication/OpenPanelCountdown";
export const dynamic = "force-dynamic";
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<DiscoveryFilters>;
}) {
  const filters = await searchParams;
  const data = await catalogue();
  const features = filterFeatures(data, filters).sort(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );
  return (
    <main className="editorial-page">
      <EditorialHeader />
      <IssueNavigation />
      <div className="op-workspace">
        <p className="op-eyebrow">FIND YOUR NEXT PANEL</p>
        <h1>Search</h1>
        {data.message && <p className="op-notice">{data.message}</p>}
        <DiscoveryForm data={data} filters={filters} />
        <p role="status">{features.length} matching panels</p>
        {features.map((f) => {
          const issue = data.issues.find((i) => i.id === f.issue_id)!;
          const drop = data.drops.find((d) => d.id === f.weekly_drop_id);
          return (
            <article className="search-panel" key={f.id}>
              <p className="op-eyebrow">
                {data.categories.find((c) => c.id === f.category_id)?.name} /{" "}
                {data.formats.find((c) => c.id === f.format_id)?.name} /{" "}
                {issue.title} / {drop?.label}
              </p>
              <h2>
                <Link href={`/features/${f.slug}`}>{f.title} ↗</Link>
              </h2>
              <p>{f.summary}</p>
              <p>
                <time dateTime={f.published_at}>
                  {new Date(f.published_at).toLocaleDateString("en-GB", {
                    timeZone: "UTC",
                  })}
                </time>{" "}
                ·{" "}
                <OpenPanelCountdown feature={f} issue={issue} now={data.now} />
              </p>
              <div className="op-actions">
                {data.tags
                  .filter((t) =>
                    data.featureTags.some(
                      (ft) => ft.feature_id === f.id && ft.tag_id === t.id,
                    ),
                  )
                  .map((t) => (
                    <Link key={t.id} href={`/search?tag=${t.slug}`}>
                      {t.name}
                    </Link>
                  ))}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
