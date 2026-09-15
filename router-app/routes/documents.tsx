import { Link } from "react-router";
import type { Route } from "./+types/documents";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";

export const meta: Route.MetaFunction = () => [
  { title: "Documents — KOMA://PLAY" },
  {
    name: "description",
    content: "Public KOMA://PLAY documents for readers, members and contributors.",
  },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com/documents" },
];

export default function Documents() {
  return (
    <main className="editorial-page documents-page">
      <Masthead />
      <IssueNavigation />
      <section className="op-workspace about-document">
        <nav className="profile-actions" aria-label="Document navigation">
          <Link to="/about">← ABOUT KOMA://PLAY</Link>
          <Link to="/">RETURN TO CURRENT ISSUE</Link>
        </nav>
        <p className="op-eyebrow editorial-marker">PUBLIC DOCUMENTS</p>
        <h1>Documents</h1>
        <p className="published-dek">
          Reader-facing notes for how KOMA://PLAY works, how members contribute,
          and how credit and conduct are handled.
        </p>
        <div className="documents-list">
          <article>
            <p className="editorial-marker">AVAILABLE</p>
            <h2>Community Handbook / Pocket Guide</h2>
            <p>
              Contribution, credit and conduct guidance for members entering the
              Workshop and Open Panel spaces.
            </p>
            <div className="profile-actions">
              <Link className="op-button action-primary" to="/handbook">
                READ HANDBOOK →
              </Link>
              <Link className="op-button" to="/onboarding">
                OPEN POCKET GUIDE →
              </Link>
            </div>
          </article>
          <article>
            <p className="editorial-marker">AVAILABLE</p>
            <h2>About KOMA://PLAY</h2>
            <p>
              The publication model, monthly cadence, roles, credit culture and
              anti-slop ethos.
            </p>
            <Link className="op-button" to="/about">
              READ ABOUT →
            </Link>
          </article>
          <article>
            <p className="editorial-marker">COMING NEXT</p>
            <h2>Contribution guidance</h2>
            <p>
              A fuller public guide for sources, screenshots, clips and revision
              etiquette is planned. Until then, use the Community Handbook and
              feature-specific Workshop prompts.
            </p>
          </article>
          <article>
            <p className="editorial-marker">ALPHA NOTICE · OWNER REVIEW PENDING</p>
            <h2>Privacy, cookies and terms</h2>
            <p>
              Read how accounts, contributions, cookies and moderation work now,
              and which legal decisions remain outstanding.
            </p>
            <Link className="op-button" to="/documents/platform-notice">READ PLATFORM NOTICE →</Link>
          </article>
        </div>
      </section>
    </main>
  );
}
