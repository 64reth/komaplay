"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  approved,
  handbookPanels,
  panelTitles,
  safeReturnPath,
  type HandbookState,
  type HandbookVersion,
} from "../../lib/handbook/domain";
import { HandbookCopy } from "./HandbookCopy";
export function CompactAcceptance({
  statement,
  busy = false,
  disabled = false,
}: {
  statement: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="handbook-compact">
      <input
        name="consent"
        type="checkbox"
        required
        disabled={disabled || busy}
        aria-describedby="compact-error"
      />
      {statement}
    </label>
  );
}
export function OnboardingFlow({
  version,
  initialStep = 1,
  returnTo = "/",
  firstWorkshop = null,
  preview = false,
  acceptanceDate = null,
  onAccepted,
}: {
  version: HandbookVersion;
  initialStep?: number;
  returnTo?: string;
  firstWorkshop?: string | null;
  preview?: boolean;
  acceptanceDate?: string | null;
  onAccepted?: (acceptedAt: string) => void;
}) {
  const [step, setStep] = useState(Math.min(4, Math.max(1, initialStep)));
  const [accepted, setAccepted] = useState(acceptanceDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parts = handbookPanels(version.content);
  const destination = safeReturnPath(returnTo);
  const go = (next: number) => {
    setStep(next);
    setError("");
    const url = new URL(location.href);
    url.searchParams.set("step", String(next));
    history.pushState(null, "", url.pathname + url.search);
  };
  useEffect(() => {
    const pop = () => {
      const value =
        Number(new URLSearchParams(location.search).get("step")) || 1;
      setStep(Math.max(1, Math.min(4, value)));
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  if (accepted)
    return (
      <section className="handbook-complete">
        <p className="op-eyebrow">YOUR MARK IS RECORDED</p>
        <h1>LEAVE THE PANEL BETTER THAN YOU FOUND IT.</h1>
        <p role="status">
          {version.label} accepted on{" "}
          {new Date(accepted).toLocaleDateString("en-GB", { timeZone: "UTC" })}.
        </p>
        <div className="op-actions">
          {destination !== "/" && (
            <Link className="op-button" href={destination}>
              Continue where you left off →
            </Link>
          )}
          <Link className="op-button" href="/">
            Enter Issue
          </Link>
          {firstWorkshop ? (
            <Link className="op-button" href={firstWorkshop}>
              Make Your First Contribution
            </Link>
          ) : (
            <p>
              No Open Panel is active right now. Enter the current issue to keep
              reading.
            </p>
          )}
        </div>
        <Link href="/handbook">Reopen the handbook</Link>
      </section>
    );
  if (!parts)
    return (
      <p role="alert">
        This handbook version cannot be displayed as four panels. Read it at{" "}
        <Link href="/handbook">the complete handbook</Link> and contact an
        administrator.
      </p>
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
          {panelTitles.map((title, i) => (
            <li key={title} aria-current={step === i + 1 ? "step" : undefined}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span>{title}</span>
            </li>
          ))}
        </ol>
      </div>
      {preview && (
        <p className="op-notice">
          Preview only. Sign in with a configured Supabase project and active
          handbook to record your acceptance.
        </p>
      )}
      <article className="handbook-panel" key={step}>
        <p className="op-eyebrow">{version.label}</p>
        <h1>{panelTitles[step - 1]}</h1>
        <HandbookCopy content={parts[step - 1]} panel />
        {step === 4 && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              if (preview) {
                setError("Configure Supabase and sign in before accepting.");
                return;
              }
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
                const response = await fetch("/api/handbook/accept", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    version_id: version.id,
                    content_hash: version.content_hash,
                    statement_version: version.statement_version,
                    consent,
                    returnTo: destination,
                  }),
                });
                const data = (await response.json()) as {
                  error?: string;
                  accepted_at?: string;
                };
                if (!response.ok || !data.accepted_at)
                  throw new Error(
                    data.error ?? "Acceptance could not be saved.",
                  );
                setAccepted(data.accepted_at);
                onAccepted?.(data.accepted_at);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>The Compact</h2>
            <CompactAcceptance
              statement={version.acceptance_statement}
              busy={busy}
              disabled={preview}
            />
            <p id="compact-error" role={error ? "alert" : undefined}>
              {error}
            </p>
            {error && (
              <a
                href={`/onboarding?returnTo=${encodeURIComponent(destination)}`}
              >
                Load the current handbook
              </a>
            )}
            <button
              disabled={preview || busy}
              className="op-button action-primary"
            >
              {busy ? "Recording your mark…" : "Accept the Compact"}
            </button>
          </form>
        )}
      </article>
      <nav className="handbook-controls" aria-label="Handbook panels">
        <button disabled={step === 1 || busy} onClick={() => go(step - 1)}>
          ← Back
        </button>
        <Link href="/">Return to reading</Link>
        {step < 4 ? (
          <button onClick={() => go(step + 1)}>Next →</button>
        ) : (
          <Link href="/handbook">Complete handbook</Link>
        )}
      </nav>
    </section>
  );
}
export function AuthenticatedOnboarding({
  returnTo,
  initialStep,
  firstWorkshop,
}: {
  returnTo: string;
  initialStep: number;
  firstWorkshop: string | null;
}) {
  const [state, setState] = useState<HandbookState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/handbook/status", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as HandbookState & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error ?? "Unable to load your handbook.");
        if (live) setState(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <a
          href={typeof location !== "undefined" ? location.href : "/onboarding"}
        >
          Retry
        </a>
      </p>
    );
  if (!state) return <p role="status">Loading your community handbook…</p>;
  if (!state.version) return <p role="alert">{state.message}</p>;
  return (
    <OnboardingFlow
      key={state.version.id}
      version={state.version}
      returnTo={returnTo}
      initialStep={initialStep}
      firstWorkshop={firstWorkshop}
      acceptanceDate={state.acceptance?.accepted_at}
    />
  );
}
export const previewVersion: HandbookVersion = {
  ...approved,
  id: "preview",
  published_at: "2026-09-10T00:00:00Z",
  active: false,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
  created_by: null,
};
