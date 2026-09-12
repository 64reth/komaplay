import React, {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useLocation, useRevalidator, useRouteLoaderData } from "react-router";
import type { AuthSnapshot } from "../../lib/auth";
import type { HandbookState } from "../../lib/handbook";
import {
  supabaseBrowser,
  type BrowserSupabaseConfig,
} from "../../lib/browser-supabase";
import { OnboardingFlow } from "./OnboardingFlow";

type MembershipSnapshot =
  | HandbookState
  | {
      status: "public" | "restricted" | "suspended";
      version: null;
      acceptance: null;
      message?: string;
    };
type RootData = {
  auth: AuthSnapshot;
  membership: MembershipSnapshot;
  supabase: BrowserSupabaseConfig | null;
};

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
  const data = useRouteLoaderData("root") as RootData | undefined;
  const location = useLocation();
  const revalidator = useRevalidator();
  const background = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [acceptedLocally, setAcceptedLocally] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const membership = data?.membership;
  const memberId =
    data?.auth.state === "authenticated" ? data.auth.member.id : null;
  const required =
    location.pathname !== "/onboarding" &&
    membership?.status === "required" &&
    Boolean(membership.version) &&
    !acceptedLocally;
  const client = supabaseBrowser(data?.supabase ?? null);

  useEffect(() => {
    setAcceptedLocally(false);
  }, [memberId]);

  useEffect(() => {
    const page = background.current;
    if (!required) {
      page?.removeAttribute("inert");
      document.body.classList.remove("membership-onboarding-open");
      document.body.style.removeProperty("overflow");
      return;
    }
    page?.setAttribute("inert", "");
    document.body.classList.add("membership-onboarding-open");
    document.body.style.overflow = "hidden";
    dispatchEvent(new Event("komaplay:membership-lock"));
    const focusFrame = requestAnimationFrame(() => {
      dialog.current
        ?.querySelector<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),a[href]",
        )
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      page?.removeAttribute("inert");
      document.body.classList.remove("membership-onboarding-open");
      document.body.style.removeProperty("overflow");
    };
  }, [required, location.pathname]);

  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.current!.querySelectorAll<HTMLElement>(
        "button:not([disabled]),input:not([disabled]),a[href]",
      ),
    ];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div ref={background} className="membership-background">
        {children}
      </div>
      {required && membership?.version && (
        <MembershipOnboardingLayer>
          <div
            ref={dialog}
            className="workshop-onboarding-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="membership-guide-title"
            onKeyDown={trap}
          >
            <p className="editorial-marker">ONE STEP BEFORE THE WORKSHOP</p>
            <h2 id="membership-guide-title">
              Read and accept the KOMA://PLAY Pocket Guide
            </h2>
            <p>
              Understand how contributions, public credit and conduct work
              before member features unlock.
            </p>
            <OnboardingFlow
              version={membership.version}
              returnTo={location.pathname + location.search}
              onAccepted={() => {
                setAcceptedLocally(true);
                setAnnouncement("Workshop access is ready.");
                void revalidator.revalidate();
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(
                      "main h1, main [role=status], .account-nav button",
                    )
                    ?.focus(),
                );
              }}
            />
            <button
              type="button"
              onClick={async () => {
                await client?.auth.signOut();
                setAcceptedLocally(false);
                await revalidator.revalidate();
              }}
            >
              SIGN OUT AND CONTINUE READING
            </button>
          </div>
        </MembershipOnboardingLayer>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
}
