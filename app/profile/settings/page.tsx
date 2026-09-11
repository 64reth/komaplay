/* eslint-disable react-hooks/error-boundaries */
import Link from "next/link";
import { EditorialHeader } from "../../../components/EditorialNavigation";
import { communityIdentity } from "../../../lib/open-panel/server";

export const dynamic = "force-dynamic";

export default async function Settings() {
  try {
    const { profile } = await communityIdentity(false, "/profile/settings");
    return (
      <main className="editorial-page">
        <EditorialHeader />
        <div className="op-workspace">
          <nav className="profile-actions" aria-label="Settings actions">
            <Link href="/profile">← RETURN TO PROFILE</Link>
            <Link href="/">RETURN TO PUBLICATION</Link>
          </nav>
          <p className="op-eyebrow editorial-marker">SETTINGS</p>
          <h1>Panel settings</h1>
          <form
            className="op-form"
            action="/api/profile/settings"
            method="post"
          >
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={profile.display_name}
                maxLength={80}
              />
            </label>
            <label>
              Pen name
              <input name="pen_name" maxLength={80} />
            </label>
            <label>
              Bio
              <textarea name="bio" maxLength={280} />
            </label>
            <label>
              Default public credit
              <select name="default_credit">
                <option>Display name</option>
                <option>Pen name</option>
                <option>Anonymous Panelist</option>
              </select>
            </label>
            <label className="op-check">
              <input type="checkbox" name="workbench" />
              Allow my selected name in privacy-safe Workbench activity
            </label>
            <label className="op-check">
              <input type="checkbox" name="newsletter" />
              Receive the editorial newsletter
            </label>
            <label>
              Motion
              <select name="motion">
                <option>Follow system</option>
                <option>Reduce motion</option>
              </select>
            </label>
            <button className="action-primary">Save settings</button>
            <p>
              Editorial emails are not yet delivered in this alpha. Security
              notifications remain mandatory.
            </p>
          </form>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="editorial-page">
        <EditorialHeader />
        <div className="op-workspace">
          <h1>Sign in to edit settings</h1>
          <Link className="op-button action-primary" href="/profile">
            RETURN TO PROFILE
          </Link>
        </div>
      </main>
    );
  }
}
