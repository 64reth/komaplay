import { Link, useSearchParams } from "react-router";
export function OnboardingIntroduction() {
  const [query] = useSearchParams();
  const mode = query.get("mode");
  return (
    <section
      className="handbook-introduction"
      aria-labelledby="onboarding-title"
    >
      <p className="op-eyebrow editorial-marker">COMMUNITY HANDBOOK</p>
      <h1 id="onboarding-title">ENTER THE PANEL</h1>
      <p>
        Sign in to read and accept the KOMA://PLAY Pocket Guide before you
        contribute. Public articles remain available without an account.
      </p>
      {mode && (
        <p className="op-notice" role="status">
          Authentication will open here when the membership layer is migrated.
        </p>
      )}
      <div className="op-actions">
        <Link
          className="op-button action-primary"
          to="/onboarding?mode=sign-in"
        >
          SIGN IN
        </Link>
        <Link className="op-button" to="/onboarding?mode=create">
          CREATE ACCOUNT
        </Link>
      </div>
      <Link to="/">← RETURN TO PUBLICATION</Link>
    </section>
  );
}
