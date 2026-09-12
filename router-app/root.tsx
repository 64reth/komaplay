import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];
export const meta: Route.MetaFunction = () => [{ title: "KOMA://PLAY — Issue Zero" }, { name: "description", content: "A living publication for games, manga and anime." }];
export function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>; }
export default function App() { return <Outlet />; }
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) { const missing = isRouteErrorResponse(error) && error.status === 404; return <main className="editorial-page"><header className="editorial-nav"><a className="wordmark" href="/">KOMA://PLAY</a><span>ISSUE ZERO</span></header><section className="op-workspace"><p className="editorial-marker">{missing ? "PANEL NOT FOUND" : "PRINT ERROR"}</p><h1>{missing ? "This panel is missing." : "The panel slipped."}</h1><p>{import.meta.env.DEV && error instanceof Error ? error.message : "The panel could not be prepared."}</p><a className="op-button action-primary" href="/">RETURN TO CURRENT ISSUE →</a></section></main>; }
