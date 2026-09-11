"use client";

import Link from "next/link";

function openAuthentication(mode: "sign-in" | "create") {
  window.dispatchEvent(new CustomEvent("komaplay:auth", { detail: { mode } }));
}

export function OnboardingIntroduction() {
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
          onClick={() => openAuthentication("sign-in")}
        >
          SIGN IN
        </button>
        <button
          className="op-button"
          onClick={() => openAuthentication("create")}
        >
          CREATE ACCOUNT
        </button>
      </div>
      <Link href="/">← RETURN TO PUBLICATION</Link>
    </section>
  );
}
