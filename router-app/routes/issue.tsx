import { data } from "react-router";
import type { Route } from "./+types/issue";
import { catalogue } from "../lib/publication.server";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { IssuePage } from "../components/publication/IssuePage";
export async function loader({ params }: { params: { slug?: string } }) {
  const all = await catalogue();
  const issue = all.issues.find((i) => i.slug === params.slug);
  if (!issue) {
    if (all.message && !all.demo) throw data(all.message, { status: 503 });
    throw data("Issue not found", { status: 404 });
  }
  return { all, issue };
}
export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? [
        { title: `${loaderData.issue.title} — KOMA://PLAY` },
        { name: "description", content: loaderData.issue.subtitle },
        {
          tagName: "link",
          rel: "canonical",
          href: `https://komaplay.com/issues/${loaderData.issue.slug}`,
        },
      ]
    : [];
export default function Issue({ loaderData }: Route.ComponentProps) {
  return (
    <main className="editorial-page">
      <Masthead />
      <IssueNavigation />
      {loaderData.all.message && (
        <p className="op-notice">{loaderData.all.message}</p>
      )}
      <IssuePage issue={loaderData.issue} data={loaderData.all} />
    </main>
  );
}
