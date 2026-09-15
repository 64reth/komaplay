import { useEffect, useRef, useState } from "react";
import { safeReturnPath } from "../lib/handbook";

export function AuthCompletion({ returnTo }: { returnTo: string }) {
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 15000;
    setWaiting(true);
    heading.current?.focus();
    const poll = async (count: number) => {
      try {
        const response = await fetch("/auth/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnTo }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        const result = (await response.json()) as {
          state?: string;
          next?: string;
        };
        if (stopped) return;
        if (response.ok && result.state === "ready" && result.next) {
          window.location.replace(safeReturnPath(result.next, "/profile"));
          return;
        }
      } catch {
        if (stopped) return;
      }
      if (count < 5 && Date.now() < deadline)
        timer = setTimeout(() => void poll(count + 1), 500);
      else setWaiting(false);
    };
    void poll(0);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt, returnTo]);
  return (
    <main className="editorial-page">
      <section className="op-workspace" aria-busy={waiting}>
        <p className="editorial-marker">KOMA://PLAY ACCOUNT</p>
        <h1 ref={heading} tabIndex={-1}>
          {waiting ? "Completing your sign-in…" : "Let’s finish your sign-in"}
        </h1>
        <p role={waiting ? "status" : "alert"}>
          {waiting
            ? "We’re getting your membership ready. You don’t need to sign in again."
            : "We couldn’t finish setting up your membership just now. Please try again—we’ll check your existing sign-in without sending you back to Google."}
        </p>
        {!waiting && (
          <button
            className="op-button action-primary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            TRY AGAIN
          </button>
        )}
        <a href="/" className="op-button">
          RETURN TO PUBLICATION
        </a>
      </section>
    </main>
  );
}
