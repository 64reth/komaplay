import { notFound } from "next/navigation";
import { catalogue } from "../../../lib/publication/server";
import { identity } from "../../../lib/open-panel/server";
import { EditorialHeader } from "../../../components/EditorialNavigation";
import { IssueNavigation } from "../../../components/publication/IssueNavigation";
import { IssuePage } from "../../../components/publication/IssuePage";
export const dynamic = "force-dynamic";
export default async function IssueRoute({
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
          <p>
            Sign in as a moderator or administrator in the Workshop to preview
            unpublished content.
          </p>
        </main>
      );
    }
  }
  const data = await catalogue(preview);
  const issue = data.issues.find((i) => i.slug === slug);
  if (!issue) notFound();
  return (
    <main className="editorial-page">
      <EditorialHeader issueLabel={issue.title} />
      <IssueNavigation />
      {data.message && <p className="op-notice">{data.message}</p>}
      {preview && (
        <p className="op-notice">
          Private editorial preview · unpublished content
        </p>
      )}
      <IssuePage issue={issue} data={data} />
    </main>
  );
}
