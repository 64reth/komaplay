"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { onboardingHref, type HandbookState } from "../../lib/handbook/domain";
export function OnboardingGate({
  state,
  returnTo,
  children,
}: {
  state: HandbookState | null;
  returnTo: string;
  children: ReactNode;
}) {
  if (!state) return <p role="status">Checking your handbook acceptance…</p>;
  if (state.status === "unavailable")
    return (
      <div className="op-notice" role="alert">
        <p>{state.message}</p>
        <Link href="/handbook">Read the handbook</Link>
      </div>
    );
  if (state.status !== "accepted")
    return (
      <section className="op-notice">
        <h2>Welcome to the Panel</h2>
        <p>
          Read the four-panel community handbook and leave your mark before
          participating.
        </p>
        <Link className="op-button" href={onboardingHref(returnTo)}>
          Open your field guide →
        </Link>
        <p>
          <Link href="/">Keep reading the current issue</Link>
        </p>
      </section>
    );
  return <>{children}</>;
}
