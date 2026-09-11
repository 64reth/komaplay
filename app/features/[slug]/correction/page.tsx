import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogue } from "../../../../lib/publication/server";
import { acceptsContributions } from "../../../../lib/publication/domain";
import { EditorialHeader } from "../../../../components/EditorialNavigation";
import { CorrectionReportForm } from "../../../../components/publication/CorrectionReportForm";
export const dynamic = "force-dynamic";
export default async function CorrectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await catalogue();
  const feature = data.features.find((f) => f.slug === slug);
  if (!feature) notFound();
  const issue = data.issues.find((i) => i.id === feature.issue_id)!;
  return (
    <main className="editorial-page">
      <EditorialHeader slug={slug} issueLabel={issue.title} />
      <div className="op-workspace">
        <Link href={`/features/${slug}`}>← Published Panel</Link>
        <p className="op-eyebrow">{feature.title}</p>
        <h1>Report a Correction</h1>
        {acceptsContributions(feature, issue, data.now) ? (
          <p>
            This Panel is still open.{" "}
            <Link href={`/features/${slug}/workshop`}>
              Propose a correction in its Workshop.
            </Link>
          </p>
        ) : (
          <CorrectionReportForm featureId={feature.id} demo={data.demo} />
        )}
      </div>
    </main>
  );
}
