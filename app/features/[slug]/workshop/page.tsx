import { notFound } from "next/navigation";
import { catalogue } from "../../../../lib/publication/server";
import { acceptsContributions } from "../../../../lib/publication/domain";
import { EditorialHeader } from "../../../../components/EditorialNavigation";
import { OpenPanelWorkshop } from "../../../../components/open-panel/OpenPanelWorkshop";
import { WorkshopHeader } from "../../../../components/open-panel/WorkshopHeader";
import { identity } from "../../../../lib/open-panel/server";
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
  let role: string | undefined;
  try {
    role = (await identity()).profile.role;
  } catch {
    // Signed-out visitors receive the safe public utility set.
  }
  return (
    <main className="editorial-page">
      <EditorialHeader slug={slug} issueLabel={issue.title} />
      <div className="op-workspace workshop-page">
        <WorkshopHeader
          feature={feature}
          issue={issue}
          now={data.now}
          open={open}
          role={role}
        />
        <noscript>
          JavaScript is required to sign in and manage contributions. The
          Community Edition remains readable without it.
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
