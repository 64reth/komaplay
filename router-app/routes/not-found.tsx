import { Link } from "react-router";
import type { Route } from "./+types/not-found";
import { Masthead } from "../components/Masthead";
export const meta: Route.MetaFunction=()=>[{title:"Panel not found — KOMA://PLAY"}];
export default function NotFound(){return <main className="editorial-page"><Masthead/><section className="op-workspace"><p className="editorial-marker">404 · PANEL NOT FOUND</p><h1>This panel is missing.</h1><p>The requested page is not part of this issue.</p><Link className="op-button action-primary" to="/">RETURN TO CURRENT ISSUE →</Link></section></main>;}
