import { Link } from "react-router";
import { AccountNav } from "./AccountNav";

export function Masthead({issueLabel="ISSUE ZERO"}: { slug?: string; issueLabel?:string }) {
  return (
    <header className="editorial-nav">
      <Link className="wordmark" to="/">
        KOMA://PLAY
      </Link>
      <span>{issueLabel}</span>
      <Link to="/about">ABOUT</Link>
      <AccountNav />
    </header>
  );
}
