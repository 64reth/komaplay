import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogue } from "../../../../lib/publication/server";
import { acceptsContributions } from "../../../../lib/publication/domain";
import { EditorialHeader } from "../../../../components/EditorialNavigation";
import { OpenPanelWorkshop } from "../../../../components/open-panel/OpenPanelWorkshop";
import { OpenPanelCountdown } from "../../../../components/publication/OpenPanelCountdown";
export const dynamic = "force-dynamic";
export default async function WorkshopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await catalogue();
  const feature = data.features.find((f) => f.slug === slug);
  if (!feature) notFound();
  const issue = data.issues.find((i) => i.id === feature.issue_id)!;
  const open = acceptsContributions(feature, issue, data.now);
  return (
    <main className="editorial-page">
      <EditorialHeader slug={slug} issueLabel={issue.title} />
      <div className="op-workspace">
        <Link href={`/features/${slug}`}>← RETURN TO COMMUNITY EDITION</Link>
        <p className="op-eyebrow">OPEN PANEL WORKSHOP</p>
        <h1>{feature.title}</h1>
        <p className="op-eyebrow">
          BUILDING REVISION {feature.current_revision + 1}
        </p>
        <OpenPanelCountdown feature={feature} issue={issue} now={data.now} />
        <p>
          {open
            ? "A place to make the article more useful. Propose, refine, and publish with credit."
            : "The contribution window has ended. Your submissions and their decisions are preserved below."}
        </p>
        {!open && (
          <Link href={`/features/${slug}/correction`}>
            Report a private correction ↗
          </Link>
        )}
        <noscript>
          JavaScript is required to sign in and manage contributions. The
          Published Panel remains readable without it.
        </noscript>
        <OpenPanelWorkshop
          featureId={data.demo ? null : feature.id}
          readOnly={!open}
          featureTitle={feature.title}
        />
      </div>
    </main>
  );
}
