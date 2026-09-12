import React, { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { launchAuthentication, type AuthMode } from "../AccountNav";

export function OnboardingIntroduction({
  returnTo = "/profile",
}: {
  returnTo?: string;
}) {
  const [query] = useSearchParams();
  const mode = query.get("mode");
  useEffect(() => {
    if (mode === "sign-in" || mode === "create")
      launchAuthentication(mode as AuthMode, returnTo);
  }, [mode, returnTo]);
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
      <div className="op-actions">
        <button
          className="op-button action-primary"
          onClick={() => launchAuthentication("sign-in", returnTo)}
        >
          SIGN IN
        </button>
        <button
          className="op-button"
          onClick={() => launchAuthentication("create", returnTo)}
        >
          CREATE ACCOUNT
        </button>
      </div>
      <Link to="/">← RETURN TO PUBLICATION</Link>
    </section>
  );
}
