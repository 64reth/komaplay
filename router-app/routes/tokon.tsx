import { Link } from "react-router";
import type { Route } from "./+types/tokon";
import { Masthead } from "../components/Masthead";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { tokonGuide } from "../data/tokon-guide";
export const meta: Route.MetaFunction=()=>[{title:"Tōkon: What the First Ten Hours Don’t Tell You — KOMA://PLAY"},{name:"description",content:tokonGuide.header.deck},{tagName:"link",rel:"canonical",href:"https://komaplay.com/features/tokon"}];
export default function Tokon(){return <main className="editorial-page"><Masthead slug="tokon"/><article className="published-panel"><div className="published-heading"><p className="editorial-marker">COMMUNITY EDITION · REVISION 03</p><p className="published-dek">Built from the original feature and published community knowledge.</p><div className="op-status"><div><b>OPEN PANEL</b><span>Accepting contributions for the next revision</span></div><span>12 DAYS REMAINING</span></div></div><div className="published-body phase-one-article"><ArticleRenderer document={tokonGuide}/></div></article><footer className="op-footer" id="workshop-link"><Link to="/">← ISSUE ZERO</Link><span>ADD TO THIS EDITORIAL →</span></footer></main>;}
