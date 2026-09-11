import Link from "next/link";
import { notFound } from "next/navigation";
import { editorial } from "../../../data/editorial";
import { publicPanel, identity } from "../../../lib/open-panel/server";
import { catalogue } from "../../../lib/publication/server";
import { acceptsContributions } from "../../../lib/publication/domain";
import {
  OpenPanelStatus,
  CommunityAdditions,
  RevisionHistory,
} from "../../../components/open-panel/PublishedPanel";
import { OpenPanelCountdown } from "../../../components/publication/OpenPanelCountdown";
import {
  EditorialHeader,
  EditorialKeyboard,
} from "../../../components/EditorialNavigation";
import { IssueNavigation } from "../../../components/publication/IssueNavigation";
export const dynamic = "force-dynamic";
export default async function FeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const preview = (await searchParams).preview === "1";
  if (preview) {
    try {
      await identity(true);
    } catch {
      return (
        <main className="op-workspace">
          <h1>Editorial preview</h1>
          <p>Moderator or administrator sign-in is required.</p>
        </main>
      );
    }
  }
  const data = await catalogue(preview);
  const feature = data.features.find((f) => f.slug === slug);
  if (!feature) {
    if (data.message && !data.demo)
      return (
        <main className="op-workspace">
          <h1>Panel temporarily unavailable</h1>
          <p>{data.message}</p>
          <Link href="/">Return to current issue</Link>
        </main>
      );
    notFound();
  }
  const issue = data.issues.find((i) => i.id === feature.issue_id)!;
  const panel = await publicPanel(slug);
  const copy = editorial[slug];
  const open = acceptsContributions(feature, issue, data.now);
  const related = data.relationships.filter(
    (r) => r.feature_id === feature.id || r.related_id === feature.id,
  );
  return (
    <main className="editorial-page">
      <EditorialHeader slug={slug} issueLabel={issue.title} />
      <EditorialKeyboard slug={slug} />
      <IssueNavigation />
      <article className="published-panel">
        <div className="published-heading">
          <p className="op-eyebrow">
            PUBLISHED PANEL /{" "}
            {data.categories.find((c) => c.id === feature.category_id)?.name} /{" "}
            {data.formats.find((f) => f.id === feature.format_id)?.name} /{" "}
            <Link href={`/issues/${issue.slug}`}>{issue.title}</Link>
          </p>
          {preview && <p className="op-notice">Private editorial preview</p>}
          <h1>{feature.title}</h1>
          <p className="published-dek">{feature.summary}</p>
          <OpenPanelCountdown feature={feature} issue={issue} now={data.now} />
          <OpenPanelStatus data={panel.data} slug={slug} open={open} />
        </div>
        <div className="published-body">
          <figure className="published-clue">
            <img
              src={feature.image}
              alt={feature.image_alt || copy?.meta || "Editorial clue"}
            />
          </figure>
          <section id="overview">
            <p className="op-eyebrow">{copy?.meta ?? "INK//:PLAY EDITORIAL"}</p>
            <h2>Overview</h2>
            <p className="op-prose">
              {feature.editorial_body ||
                copy?.body ||
                "This editorial panel is being prepared."}
            </p>
          </section>
        </div>
        {panel.message && (
          <p className="op-notice" role="status">
            {panel.message}
          </p>
        )}
        <CommunityAdditions additions={panel.data?.additions ?? []} />
        <RevisionHistory
          revisions={panel.data?.revisions ?? []}
          credits={panel.data?.credits ?? []}
        />
        {related.length > 0 && (
          <aside className="feature-continuity">
            <h2>Continue reading</h2>
            {related.map((r) => {
              const next = data.features.find(
                (f) =>
                  f.id ===
                  (r.feature_id === feature.id ? r.related_id : r.feature_id),
              );
              if (!next) return null;
              const parent = data.issues.find((i) => i.id === next.issue_id);
              return (
                <p key={`${r.feature_id}-${r.related_id}-${r.kind}`}>
                  <Link href={`/features/${next.slug}`}>
                    {r.kind === "related"
                      ? "Related feature"
                      : r.feature_id === feature.id
                        ? "Continues from"
                        : "Continued in"}
                    : {next.title} — {parent?.title} ↗
                  </Link>
                </p>
              );
            })}
          </aside>
        )}
      </article>
      <footer className="op-footer">
        <Link href={`/issues/${issue.slug}`}>← {issue.title}</Link>
        <Link href={`/features/${slug}/${open ? "workshop" : "correction"}`}>
          {open ? "Enter the Workshop" : "Report a Correction"} ↗
        </Link>
      </footer>
    </main>
  );
}
