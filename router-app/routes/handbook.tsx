import { Link } from "react-router";
import type { Route } from "./+types/handbook";
import { publicHandbook } from "../lib/publication.server";
import approved from "../data/handbook-v1.json";
import { Masthead } from "../components/Masthead";
import { HandbookCopy } from "../components/handbook/HandbookCopy";
export async function loader() {
  return publicHandbook();
}
export const meta: Route.MetaFunction = () => [
  { title: "Community handbook — KOMA://PLAY" },
  {
    name: "description",
    content: "How contribution, credit and conduct work at KOMA://PLAY.",
  },
  { tagName: "link", rel: "canonical", href: "https://komaplay.com/handbook" },
];
export default function Handbook({ loaderData }: Route.ComponentProps) {
  const version = loaderData.version;
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace handbook-page">
        <Link to="/">← Current issue</Link>
        <p className="op-eyebrow editorial-marker">
          KOMA://PLAY / COMMUNITY HANDBOOK
        </p>
        <h1>Community handbook</h1>
        <p>{version?.label ?? approved.label}</p>
        {loaderData.message && (
          <p className="op-notice">{loaderData.message}</p>
        )}
        <HandbookCopy content={version?.content ?? approved.content} />
        <p>
          <Link className="op-button" to="/onboarding">
            Read the four-panel field guide
          </Link>
        </p>
      </div>
    </main>
  );
}
