"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { browserClient } from "../../lib/supabase/client";
import { OnboardingFlow } from "./OnboardingFlow";
import type { HandbookState } from "../../lib/handbook/domain";

type Phase = "public" | "verifying" | "required" | "accepted" | "blocked";

export function MembershipOnboardingLayer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="membership-onboarding" role="presentation">
      <div className="membership-onboarding-backdrop" aria-hidden="true" />
      <div className="membership-onboarding-panel">{children}</div>
    </div>
  );
}

export function GlobalMembershipGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("public");
  const [state, setState] = useState<HandbookState | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const background = useRef<HTMLDivElement>(null);
  const client = browserClient();
  const pathname = usePathname();
  const onboarding =
    pathname !== "/onboarding" && phase === "required" && state?.version;

  useEffect(() => {
    let live = true;
    const check = async () => {
      setPhase("verifying");
      const session = await fetch("/api/open-panel/session", {
        cache: "no-store",
      });
      if (!session.ok) {
        if (live) {
          setPhase("public");
          setState(null);
        }
        return;
      }
      const handbook = await fetch("/api/handbook/status", {
        cache: "no-store",
      });
      const value = (await handbook.json()) as HandbookState;
      if (!live) return;
      setState(value);
      setPhase(
        value.status === "accepted"
          ? "accepted"
          : value.status === "required"
            ? "required"
            : "blocked",
      );
    };
    void check();
    const sub = client?.auth.onAuthStateChange(() => void check());
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    const element = background.current;
    if (!onboarding) {
      element?.removeAttribute("inert");
      document.body.classList.remove("membership-onboarding-open");
      return;
    }
    element?.setAttribute("inert", "");
    document.body.classList.add("membership-onboarding-open");
    window.dispatchEvent(new Event("komaplay:membership-lock"));
    const focus = dialog.current?.querySelector<HTMLElement>(
      "button:not([disabled]),input:not([disabled]),a[href]",
    );
    focus?.focus();
    return () => {
      element?.removeAttribute("inert");
      document.body.classList.remove("membership-onboarding-open");
    };
  }, [onboarding]);

  return (
    <>
      <div ref={background} className="membership-background">
        {children}
      </div>
      {onboarding && (
        <MembershipOnboardingLayer>
          <div
            ref={dialog}
            className="workshop-onboarding-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="membership-guide-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") event.preventDefault();
            }}
          >
            <p className="op-eyebrow">VERIFYING MEMBERSHIP</p>
            <h2 id="membership-guide-title">
              Read and accept the KOMA://PLAY Pocket Guide
            </h2>
            <OnboardingFlow
              version={state.version!}
              returnTo={
                typeof location === "undefined"
                  ? "/"
                  : location.pathname + location.search
              }
              onAccepted={() => {
                setPhase("accepted");
                setState((current) =>
                  current && current.version
                    ? { ...current, status: "accepted" }
                    : current,
                );
                setTimeout(
                  () =>
                    document
                      .querySelector<HTMLElement>(
                        ".account-nav button,.editorial-nav h1,.op-workspace h1",
                      )
                      ?.focus(),
                  0,
                );
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await client?.auth.signOut();
                setPhase("public");
                setState(null);
              }}
            >
              SIGN OUT AND CONTINUE READING
            </button>
          </div>
        </MembershipOnboardingLayer>
      )}
    </>
  );
}
