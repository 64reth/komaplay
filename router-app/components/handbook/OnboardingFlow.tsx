import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  handbookPanels,
  panelTitles,
  safeReturnPath,
  type HandbookVersion,
} from "../../lib/handbook";
import { HandbookCopy } from "./HandbookCopy";

export function OnboardingFlow({
  version,
  initialStep = 1,
  returnTo = "/",
  onAccepted,
}: {
  version: HandbookVersion;
  initialStep?: number;
  returnTo?: string;
  onAccepted: (acceptedAt: string) => void;
}) {
  const location = useLocation();
  const [step, setStep] = useState(Math.min(4, Math.max(1, initialStep)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panels = handbookPanels(version.content);
  const destination = safeReturnPath(returnTo);

  useEffect(() => {
    const update = () => {
      const value =
        Number(new URLSearchParams(location.search).get("step")) || 1;
      setStep(Math.min(4, Math.max(1, value)));
    };
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, [location.search]);

  function move(next: number) {
    setError("");
    setStep(next);
    const url = new URL(
      location.pathname + location.search,
      window.location.origin,
    );
    url.searchParams.set("step", String(next));
    history.pushState(null, "", url.pathname + url.search);
  }

  if (!panels)
    return (
      <div>
        <p role="alert">
          This Pocket Guide cannot be displayed as four panels. Membership
          features remain paused.
        </p>
        <Link to="/handbook">READ THE COMPLETE HANDBOOK</Link>
      </div>
    );

  return (
    <section
      className="onboarding-guide"
      aria-label="Four-panel community field guide"
    >
      <div className="handbook-progress">
        <p aria-live="polite" aria-atomic="true">
          PANEL {String(step).padStart(2, "0")} / 04
        </p>
        <ol>
          {panelTitles.map((title, index) => (
            <li
              key={title}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span>{title}</span>
            </li>
          ))}
        </ol>
      </div>
      <article className="handbook-panel" key={step}>
        <p className="op-eyebrow">{version.label}</p>
        <h1>{panelTitles[step - 1]}</h1>
        <HandbookCopy content={panels[step - 1]} panel />
        {step === 4 && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setError("");
              const consent =
                new FormData(event.currentTarget).get("consent") === "on";
              if (!consent) {
                setError(
                  "Please explicitly accept the compact before continuing.",
                );
                return;
              }
              setBusy(true);
              try {
                const response = await fetch("/member/handbook", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    versionId: version.id,
                    contentHash: version.content_hash,
                    statementVersion: version.statement_version,
                    consent,
                    returnTo: destination,
                  }),
                });
                const result = (await response.json()) as {
                  acceptedAt?: string;
                  error?: string;
                };
                if (!response.ok || !result.acceptedAt)
                  throw new Error(
                    result.error ?? "Acceptance could not be recorded.",
                  );
                onAccepted(result.acceptedAt);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Acceptance could not be recorded.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>The Compact</h2>
            <label className="handbook-compact">
              <input
                name="consent"
                type="checkbox"
                required
                disabled={busy}
                aria-describedby="compact-error"
              />
              {version.acceptance_statement}
            </label>
            <p id="compact-error" role={error ? "alert" : undefined}>
              {error}
            </p>
            <button className="op-button action-primary" disabled={busy}>
              {busy ? "RECORDING YOUR MARK…" : "ACCEPT THE COMPACT"}
            </button>
          </form>
        )}
      </article>
      <nav className="handbook-controls" aria-label="Handbook panels">
        <button disabled={step === 1 || busy} onClick={() => move(step - 1)}>
          ← BACK
        </button>
        <Link to="/">RETURN TO READING</Link>
        {step < 4 ? (
          <button disabled={busy} onClick={() => move(step + 1)}>
            NEXT →
          </button>
        ) : (
          <Link to="/handbook">COMPLETE HANDBOOK</Link>
        )}
      </nav>
    </section>
  );
}
