import {
  data,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { Masthead } from "./components/Masthead";
import { IssueNavigation } from "./components/IssueNavigation";
import { resolveAuth } from "./lib/auth";
import "./app.css";

export async function loader({ request }: Route.LoaderArgs) {
  const resolved = await resolveAuth(request);
  return data(
    { auth: resolved.auth, supabase: resolved.config },
    { headers: resolved.headers },
  );
}

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];
export const meta: Route.MetaFunction = () => [
  { title: "KOMA://PLAY — Issue Zero" },
  {
    name: "description",
    content: "A living publication for games, manga and anime.",
  },
];
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  return <Outlet />;
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const missing = status === 404;
  const unavailable = status === 503;
  return (
    <main className="editorial-page">
      <Masthead />
      <IssueNavigation />
      <section className="op-workspace">
        <p className="editorial-marker">
          {missing
            ? "404 · PANEL NOT FOUND"
            : unavailable
              ? "PUBLICATION UNAVAILABLE"
              : "PRINT ERROR"}
        </p>
        <h1>
          {missing
            ? "This panel is missing."
            : unavailable
              ? "The publication could not be retrieved."
              : "The panel slipped."}
        </h1>
        <p>
          {unavailable
            ? "The public data source did not answer. Please try again shortly."
            : "The requested panel could not be prepared."}
        </p>
        <Link className="op-button action-primary" to="/">
          RETURN TO CURRENT ISSUE →
        </Link>
      </section>
    </main>
  );
}
