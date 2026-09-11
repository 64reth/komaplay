import Link from "next/link";
import { EditorialHeader } from "../../components/EditorialNavigation";
import { ModerationQueue } from "../../components/open-panel/ModerationQueue";
import { identity, HttpError } from "../../lib/open-panel/server";
export const dynamic = "force-dynamic";
export default async function ModerationPage() {
  // Private queue data is fetched only after a second role check in the API.
  let denied = false;
  try {
    await identity(true);
  } catch (e) {
    denied = e instanceof HttpError && e.status === 403;
  }
  return (
    <main className="editorial-page">
      <EditorialHeader />
      <div className="op-workspace">
        <p className="op-eyebrow">OPEN PANEL / EDITORIAL DESK</p>
        <h1>Moderation</h1>
        <p>Shape useful contributions into the next published revision.</p>
        <p>
          <Link href="/handbook">Community handbook</Link>
        </p>
        {denied ? (
          <p role="alert">
            Moderator or administrator access is required.{" "}
            <Link href="/features/tokon/workshop">Return to Workshop</Link>
          </p>
        ) : (
          <ModerationQueue />
        )}
      </div>
    </main>
  );
}
