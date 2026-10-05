import { Link } from "react-router";
import type { Route } from "./+types/home";
import { catalogue } from "../lib/publication.server";
import {type DiscoveryFilters} from "../lib/publication";
import {homePublication,homeIssueLabel} from "../lib/home-publication";
import {FeatureStrip} from "../components/FeatureStrip";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { CurrentIssueHeader } from "../components/CurrentIssueHeader";
import { IssueFilters } from "../components/IssueFilters";
import { WeeklyDropStrip } from "../components/publication/WeeklyDropStrip";
import { ClosingPanels } from "../components/publication/ClosingPanels";
export async function loader({ request }: Route.LoaderArgs) {
  const data = await catalogue();
  const filters = Object.fromEntries(
    new URL(request.url).searchParams,
  ) as DiscoveryFilters;
  return {data,filters,publication:homePublication(data,filters)};
}
export const meta: Route.MetaFunction = () => [
  { title: "KOMA://PLAY — A living publication" },
  {
    name: "description",
    content: "A living publication for games, manga and anime.",
  },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com" },
];
export default function Home({ loaderData }: Route.ComponentProps) {
  const { data, filters, publication } = loaderData;
  const {issue,features,drops,hasArchive,publishedPanelCount,stripItemCount}=publication;
  return (
    <main className="editorial-page issue-home">
      <Masthead issueLabel={issue?`ISSUE ${String(issue.issue_number).padStart(2,"0")}`:"OPEN PANEL"} />
      <IssueNavigation />
      <CurrentIssueHeader issue={issue} categories={data.categories} />
      <IssueFilters selected={filters.filter} />
      {data.message && (
        <p className="publication-setup" role="status">
          {data.message}
        </p>
      )}
      {stripItemCount===0&&<FeatureStrip items={[]} label={homeIssueLabel(issue)} empty={publishedPanelCount>0?{title:"No Panels match this view.",description:"Try another filter to explore the current Issue.",to:"/",action:"SHOW ALL PANELS →"}:undefined}/>}
      {drops.map((drop, i) => (
        <WeeklyDropStrip
          key={drop.id}
          data={data}
          drop={drop}
          features={features}
          quiet={i > 0}
        />
      ))}
      <ClosingPanels data={data} features={features} />
      {hasArchive?<Link className="archive-entry" to="/archive">
        <span>EVERY ISSUE. EVERY REVISION.</span>
        <b>ENTER THE ARCHIVE →</b>
      </Link>:<p className="op-workspace">The first archived issue is still taking shape. <Link to="/archive">VIEW ARCHIVE →</Link></p>}
      <footer className="op-footer">
        <span>New panels every week. New issues every month.</span>
        {features[0] && <Link to={`/features/${features[0].slug}`}>Read a panel →</Link>}
      </footer>
      <footer className="site-handbook-footer">
        <Link to="/about">ABOUT</Link>
        <Link to="/documents">DOCUMENTS</Link>
        <Link to="/handbook">COMMUNITY HANDBOOK</Link>
      </footer>
    </main>
  );
}

// The root account navigation is personalised even though this page's content is public.
export const headers: Route.HeadersFunction = () => ({
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
});
