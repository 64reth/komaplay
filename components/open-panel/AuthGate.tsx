"use client";
import { useEffect, useState, type ReactNode } from "react";
import { browserClient } from "../../lib/supabase/client";
import { canModerate, type Role } from "../../lib/open-panel/domain";
export type Member = {
  id: string;
  display_name: string;
  role: Role;
  account_status?: "active" | "restricted" | "suspended";
};
export function GateState({
  state,
  moderator = false,
  children,
}: {
  state:
    "loading" | "signed-out" | "member" | "moderator" | "admin" | "contributor";
  moderator?: boolean;
  children: ReactNode;
}) {
  if (state === "loading")
    return <p role="status">Checking your Open Panel session…</p>;
  if (state === "signed-out")
    return (
      <p>Sign in to use Open Panel. The Published Panel is open to everyone.</p>
    );
  if (moderator && !canModerate(state))
    return <p role="alert">Moderator or administrator access is required.</p>;
  return <>{children}</>;
}
export function AuthGate({
  children,
  moderator = false,
  signedOut,
  embeddedForm = true,
}: {
  children: (user: Member) => ReactNode;
  moderator?: boolean;
  signedOut?: ReactNode;
  embeddedForm?: boolean;
}) {
  const [user, setUser] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessError, setAccessError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const client = browserClient();
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/open-panel/session", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          user?: Member;
          error?: string;
        };
        if (live) {
          if (
            !data.user &&
            new URLSearchParams(location.search).has("auth_error")
          )
            setMessage(
              "That sign-in link has expired or was already used. Request a new link.",
            );
          setUser(data.user ?? null);
          setAccessError(response.status === 401 ? "" : (data.error ?? ""));
          setError("");
          setLoading(false);
        }
      } catch {
        if (live) {
          setError(
            "Unable to check your session. Please reload and try again.",
          );
          setLoading(false);
        }
      }
    };
    void refresh();

    const subscription = client?.auth.onAuthStateChange(() => {
      void refresh();
    });
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      subscription?.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client]);
  return (
    <div className="auth-gate">
      {error && (
        <p role="alert" className="op-notice">
          {error}
        </p>
      )}
      {accessError && (
        <section className="op-notice" role="alert">
          <p className="op-eyebrow">{accessError.includes("restricted") || accessError.includes("suspended") ? "WORKSHOP RESTRICTED" : "WORKSHOP CONFIGURATION"}</p>
          <p>{accessError}</p>
        </section>
      )}
      {message && (
        <p role="status" className="op-notice">
          {message}
        </p>
      )}
      <GateState
        state={loading ? "loading" : (user?.role ?? "signed-out")}
        moderator={moderator}
      >
        {user && (
          <>
            <div className="op-session">
              <span>
                Signed in as {user.display_name} · {user.role}
              </span>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await client?.auth.signOut();
                  if (result?.error) setError(result.error.message);
                  else {
                    setUser(null);
                    setMessage("Signed out.");
                  }
                  setBusy(false);
                }}
              >
                Sign out
              </button>
              {canModerate(user.role) && <a href="/moderation">Moderation</a>}
              <a href="/handbook">Community handbook</a>
            </div>
            {user.role === "admin" && (
              <p>
                <a href="/publishing">Publishing calendar →</a>
              </p>
            )}
            {children(user)}
          </>
        )}
      </GateState>
      {!loading && !user && !accessError && signedOut}
      {!loading && !user && !accessError && client && embeddedForm && (
        <form
          className="op-form op-signin"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(event.currentTarget);
            try {
              const { error } = await client.auth.signInWithOtp({
                email: String(form.get("email")),
                options: {
                  emailRedirectTo: `${location.origin}/auth/confirm?next=${encodeURIComponent(location.pathname + location.search)}`,
                  data: { display_name: String(form.get("name")) },
                },
              });
              if (error) throw error;
              setMessage(
                "Check your email for a sign-in link. Open it in this browser to return here.",
              );
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not send a sign-in link.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Display name{" "}
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="nickname"
            />
          </label>
          <label>
            Email{" "}
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
      {!client && !loading && (
        <p className="op-notice">
          Development setup: configure NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then apply the Open Panel
          migration. See README.
        </p>
      )}
    </div>
  );
}
