import { Link } from "react-router";
import { launchAuthentication, type AuthMode } from "./AccountNav";

export function SignedOutMemberBoundary({
  title,
  returnTo,
}: {
  title: string;
  returnTo: string;
}) {
  const open = (mode: AuthMode) => launchAuthentication(mode, returnTo);
  return (
    <section className="op-workspace member-boundary">
      <p className="editorial-marker">KOMA://PLAY MEMBERSHIP</p>
      <h1>{title}</h1>
      <p>
        Sign in to continue. The public publication remains available without an
        account.
      </p>
      <div className="op-actions">
        <button
          className="op-button action-primary"
          onClick={() => open("sign-in")}
        >
          SIGN IN
        </button>
        <button className="op-button" onClick={() => open("create")}>
          CREATE ACCOUNT
        </button>
        <Link className="op-button" to="/">
          RETURN TO PUBLICATION
        </Link>
      </div>
    </section>
  );
}
