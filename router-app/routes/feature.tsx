import {SaveFeature} from "../components/SaveFeature";
import { data, Link, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/feature";
import { catalogue, publicEditorialDocument, publicPanel } from "../lib/publication.server";
import type { AuthSnapshot } from "../lib/auth";
import { workshopAccess } from "../lib/workshop";
import { acceptsContributions } from "../lib/publication";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { OpenPanelCountdown } from "../components/publication/OpenPanelCountdown";
import {
  OpenPanelStatus,
  CommunityAdditions,
  RevisionHistory,
} from "../components/open-panel/PublishedPanel";
import type { EditorialDocument } from "../lib/document";

export async function loader({ params }: { params: { slug?: string } }) {
  const all = await catalogue();
  const feature = all.features.find((item) => item.slug === params.slug);
  if (!feature) throw data("Panel not found", { status: 404 });
  const [panel, publishedDocument] = await Promise.all([publicPanel(feature.slug), publicEditorialDocument(feature.slug)]);
  if (!publishedDocument) throw data("Panel not found", { status: 404 });
  return { all, feature, panel, publishedDocument };
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.feature.title} — KOMA://PLAY` },
        { name: "description", content: loaderData.feature.summary },
        {
          tagName: "link",
          rel: "canonical",
          href: `https://komaplay.com/features/${loaderData.feature.slug}`,
        },
      ]
    : [{ title: "Panel not found — KOMA://PLAY" }];

export default function Feature({ loaderData }: Route.ComponentProps) {
  const { all, feature, panel } = loaderData;
  const document = loaderData.publishedDocument as EditorialDocument;
  const issue = all.issues.find((item) => item.id === feature.issue_id)!;
  const archived=issue.status==="archived"||feature.lifecycle_status==="archived";
  const open = acceptsContributions(feature, issue, all.now);
  const root = useRouteLoaderData("root") as { auth: AuthSnapshot; membership?: {status: "accepted" | "required" | "unavailable"} } | undefined;
  const access = workshopAccess({auth: root?.auth.state ?? "resolving", account: root?.auth.state === "authenticated" ? root.auth.member.accountStatus : undefined, handbook: root?.membership?.status, open});
  const canContribute = open && ["signed-out", "onboarding", "member"].includes(access);
  const related = all.relationships.filter(
    (relationship) =>
      relationship.feature_id === feature.id ||
      relationship.related_id === feature.id,
  );
  return (
    <main className="editorial-page">
      <Masthead issue={issue} />
      <IssueNavigation />
      <article className="published-panel">
        <div className="published-heading">
          <p className="op-eyebrow">
            {archived ? "ARCHIVED PANEL" : "PUBLISHED PANEL"} /{" "}
            {
              all.categories.find((item) => item.id === feature.category_id)
                ?.name
            }{" "}
            / {all.formats.find((item) => item.id === feature.format_id)?.name}{" "}
            / <Link to={`/issues/${issue.slug}`}>{issue.title}</Link>
          </p>
          <h1>{document.header.title}</h1>
          <p className="published-dek">{feature.summary}</p><div className="profile-actions"><SaveFeature feature={feature.id}/><Link to={`/features/${feature.slug}/report`}>REPORT A PROBLEM</Link></div>
          {archived ? <p className="op-notice">This panel is archived. Public reading remains available, but it has left the current issue spaces.</p> : <div className="panel-participation"><OpenPanelCountdown feature={feature} issue={issue} now={all.now} />{canContribute && <Link className="contribute-link" to={`/features/${feature.slug}/workshop`}>Contribute <span aria-hidden="true">→</span></Link>}</div>}
        </div>
        <div className="published-body">
          <ArticleRenderer document={document} presentation="publication" />
        </div>
        <OpenPanelStatus data={panel.data} slug={feature.slug} open={open} />
        {panel.message && (
          <p className="op-notice" role="status">
            {panel.message}
          </p>
        )}
        <CommunityAdditions
          open={open}
          additions={panel.data?.additions ?? []}
          citations={panel.data?.citations ?? []}
        />
        <RevisionHistory
          revisions={panel.data?.revisions ?? []}
          credits={panel.data?.credits ?? []}
        />
        {related.length > 0 && (
          <aside className="feature-continuity">
            <h2>Continue reading</h2>
            {related.map((relationship) => {
              const next = all.features.find(
                (item) =>
                  item.id ===
                  (relationship.feature_id === feature.id
                    ? relationship.related_id
                    : relationship.feature_id),
              );
              if (!next) return null;
              const parent = all.issues.find(
                (item) => item.id === next.issue_id,
              );
              return (
                <p
                  key={`${relationship.feature_id}-${relationship.related_id}-${relationship.kind}`}
                >
                  <Link to={`/features/${next.slug}`}>
                    {relationship.kind === "related"
                      ? "Related feature"
                      : relationship.feature_id === feature.id
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
      <footer className="op-footer" id="workshop-link">
        <Link to={`/issues/${issue.slug}`}>← {issue.title}</Link>
        <Link
          to={
            open
              ? `/features/${feature.slug}/workshop`
              : `/features/${feature.slug}/correction`
          }
        >
          {open ? "ADD TO THIS EDITORIAL →" : "REPORT A CORRECTION →"}
        </Link>
      </footer>
    </main>
  );
}
