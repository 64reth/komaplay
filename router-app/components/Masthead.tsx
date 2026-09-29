import { Link } from "react-router";
import { AccountNav } from "./AccountNav";

export function Masthead(_props: { slug?: string }) {
  void _props;
  return (
    <header className="editorial-nav">
      <Link className="wordmark" to="/">
        KOMA://PLAY
      </Link>
      <span>ISSUE ZERO</span>
      <Link to="/about">ABOUT</Link>
      <AccountNav />
    </header>
  );
}
