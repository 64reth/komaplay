import { data, Link } from "react-router";
import { IssueNavigation } from "../components/IssueNavigation";
import { Masthead } from "../components/Masthead";

export function loader() {
  return data(null, { status: 404 });
}

export default function NotFoundRoute() {
  return (
    <main className="editorial-page">
      <Masthead />
      <IssueNavigation />
      <section className="op-workspace">
        <p className="editorial-marker">404 · PANEL NOT FOUND</p>
        <h1>This panel is missing.</h1>
        <p>The requested panel could not be prepared.</p>
        <Link className="op-button action-primary" to="/">
          RETURN TO CURRENT ISSUE →
        </Link>
      </section>
    </main>
  );
}
