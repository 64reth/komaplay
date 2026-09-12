import { data, Link } from "react-router";
import type { Route } from "./+types/feature";
import { catalogue, publicPanel } from "../lib/publication.server";
import { acceptsContributions } from "../lib/publication";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { OpenPanelCountdown } from "../components/publication/OpenPanelCountdown";
import { tokonGuide } from "../data/tokon-guide";
import { editorial } from "../data/editorial";
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
  return { all, feature, panel: await publicPanel(feature.slug) };
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

function documentFor(
  feature: Route.ComponentProps["loaderData"]["feature"],
): EditorialDocument {
  if (feature.slug === "tokon") return tokonGuide;
  const copy = editorial[feature.slug];
  return {
    schemaVersion: 1,
    header: {
      eyebrow: copy?.meta ?? "KOMA://PLAY EDITORIAL",
      title: feature.title,
      panelHeadline: feature.title,
      deck: feature.summary,
      byline: "KOMA://PLAY Editorial",
      hero: {
        id: `${feature.slug}-hero`,
        src: feature.image,
        alt: feature.image_alt,
      },
      heroCaption: "KOMA://PLAY editorial artwork",
    },
    modules: [
      {
        id: `${feature.slug}-overview`,
        type: "heading",
        version: 1,
        content: { text: "Overview" },
      },
      {
        id: `${feature.slug}-body`,
        type: "paragraph",
        version: 1,
        content: {
          text:
            feature.editorial_body ||
            copy?.body ||
            "This editorial panel is being prepared.",
        },
      },
    ],
  };
}

export default function Feature({ loaderData }: Route.ComponentProps) {
  const { all, feature, panel } = loaderData;
  const issue = all.issues.find((item) => item.id === feature.issue_id)!;
  const open = acceptsContributions(feature, issue, all.now);
  const related = all.relationships.filter(
    (relationship) =>
      relationship.feature_id === feature.id ||
      relationship.related_id === feature.id,
  );
  return (
    <main className="editorial-page">
      <Masthead slug={feature.slug} />
      <IssueNavigation />
      <article className="published-panel">
        <div className="published-heading">
          <p className="op-eyebrow">
            PUBLISHED PANEL /{" "}
            {
              all.categories.find((item) => item.id === feature.category_id)
                ?.name
            }{" "}
            / {all.formats.find((item) => item.id === feature.format_id)?.name}{" "}
            / <Link to={`/issues/${issue.slug}`}>{issue.title}</Link>
          </p>
          <h1>{feature.title}</h1>
          <p className="published-dek">{feature.summary}</p>
          <OpenPanelCountdown feature={feature} issue={issue} now={all.now} />
          <OpenPanelStatus data={panel.data} slug={feature.slug} open={open} />
        </div>
        <div className="published-body">
          <ArticleRenderer document={documentFor(feature)} />
        </div>
        {panel.message && (
          <p className="op-notice" role="status">
            {panel.message}
          </p>
        )}
        <CommunityAdditions
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
