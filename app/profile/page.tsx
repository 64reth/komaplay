/* eslint-disable react-hooks/error-boundaries */
import Link from "next/link";
import { EditorialHeader } from "../../components/EditorialNavigation";
import { handbookState } from "../../lib/handbook/server";
import { resolveEditorialCapability } from "../../lib/editorial/access";
import { communityIdentity } from "../../lib/open-panel/server";

export const dynamic = "force-dynamic";

export default async function Profile() {
  try {
    const { db, user, profile } = await communityIdentity(false, "/profile");
    const [handbook, contributions, citations, editorial] = await Promise.all([
      handbookState(db, user.id),
      db
        .from("contributions")
        .select("id,status,feature_id,created_at")
        .eq("author_id", user.id),
      db
        .from("panel_citations")
        .select("id,revision_number")
        .eq("public_credit", profile.display_name),
      resolveEditorialCapability(db, profile, user.id).catch(() => false),
    ]);
    return (
      <main className="editorial-page">
        <EditorialHeader />
        <div className="op-workspace profile-page">
          <p className="op-eyebrow editorial-marker">PANEL IDENTITY</p>
          <h1>{profile.display_name}</h1>
          <nav className="profile-actions" aria-label="Profile actions">
            <Link href="/">← RETURN TO PUBLICATION</Link>
            <Link href="/profile/settings">SETTINGS</Link>
            {editorial && <Link href="/editorial">EDITORIAL DASHBOARD</Link>}
            {["moderator", "admin"].includes(profile.role) && (
              <Link href="/moderation">MODERATION</Link>
            )}
          </nav>
          <p>
            Member since{" "}
            {new Date(
              (profile as { created_at?: string }).created_at ??
                "1970-01-01T00:00:00Z",
            ).toLocaleDateString("en-GB")}
          </p>
          <p>
            {handbook.status === "accepted"
              ? "Current handbook accepted."
              : "Handbook acceptance required before Workshop participation."}
          </p>
          <p>
            {contributions.data?.filter((item) => item.status === "Accepted")
              .length ?? 0}{" "}
            published contributions · {citations.data?.length ?? 0} Panel
            Citations
          </p>
          <section id="contributions">
            <h2>My contributions</h2>
            {(contributions.data ?? []).map((contribution) => (
              <p key={contribution.id}>
                {contribution.status} ·{" "}
                <Link href="/features/tokon/workshop">View Workshop</Link>
              </p>
            ))}
          </section>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="editorial-page">
        <EditorialHeader />
        <div className="op-workspace">
          <h1>Sign in to view your profile</h1>
          <Link className="op-button action-primary" href="/">
            RETURN TO PUBLICATION
          </Link>
        </div>
      </main>
    );
  }
}
