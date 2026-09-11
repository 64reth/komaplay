/* eslint-disable react-hooks/error-boundaries */
import Link from "next/link";
import { FeatureComposer } from "../../components/editorial/FeatureComposer";
import { tokonGuide } from "../../data/tokon-guide";
import { communityIdentity } from "../../lib/open-panel/server";
export const dynamic = "force-dynamic";
export default async function EditorialDashboard() {
  try {
    const { profile, db, user } = await communityIdentity(false, "/editorial");
    const grants = await db
      .from("editorial_access_grants")
      .select("access_level")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .limit(1);
    const allowed = profile.role === "admin" || Boolean(grants.data?.length);
    if (!allowed)
      return (
        <main className="editorial-page">
          <div className="op-workspace">
            <h1>Editorial access required</h1>
            <p>
              Your member account does not have an active Editorial Dashboard
              grant.
            </p>
            <Link href="/profile">RETURN TO PROFILE</Link>
          </div>
        </main>
      );
    return (
      <main className="editorial-page">
        <div className="op-workspace">
          <FeatureComposer initial={tokonGuide} />
        </div>
      </main>
    );
  } catch {
    return (
      <main className="editorial-page">
        <div className="op-workspace">
          <h1>Sign in for Editorial Dashboard</h1>
          <p>Editorial access is checked on the server.</p>
          <Link href="/profile">SIGN IN</Link>
        </div>
      </main>
    );
  }
}
