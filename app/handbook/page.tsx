import Link from "next/link";
import { HandbookCopy } from "../../components/handbook/HandbookCopy";
import { publicHandbook } from "../../lib/handbook/server";
import { approved } from "../../lib/handbook/domain";
export const dynamic = "force-dynamic";
export default async function HandbookPage() {
  const state = await publicHandbook();
  const version = state.version;
  return (
    <main className="editorial-page">
      <div className="op-workspace handbook-page">
        <Link href="/">← Current issue</Link>
        <p className="op-eyebrow">INK//:PLAY / COMMUNITY HANDBOOK</p>
        <h1>Community handbook</h1>
        <p>{version?.label ?? approved.label}</p>
        {state.status === "unavailable" && (
          <p className="op-notice">{state.message}</p>
        )}
        {state.status === "accepted" && (
          <p role="status">Your mark is recorded for this version.</p>
        )}
        <HandbookCopy content={version?.content ?? approved.content} />
        <p>
          <Link className="op-button" href="/onboarding">
            Read the four-panel field guide
          </Link>
        </p>
      </div>
    </main>
  );
}
