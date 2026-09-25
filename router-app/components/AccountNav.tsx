import {
  Link,
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";
import React, {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import type { AuthSnapshot } from "../lib/auth";
import {
  supabaseBrowser,
  type BrowserSupabaseConfig,
} from "../lib/browser-supabase";
import { authCallbackUrl } from "../lib/auth-origin";
import { safeReturnPath } from "../lib/handbook";

type RootData = {
  auth: AuthSnapshot;
  membership?: { status: string };
  capabilities?: { editorial: boolean; moderation: boolean; admin?: boolean };
  supabase: BrowserSupabaseConfig | null;
};

export type AuthMode = "sign-in" | "create";

function understandableAuthError(error: { message: string; status?: number }) {
  if (error.status === 429 || /rate|too many/i.test(error.message))
    return "Too many requests were made. Wait a few minutes, then try again.";
  if (/invalid.*email|email.*invalid/i.test(error.message))
    return "Enter a valid email address.";
  return "The sign-in email could not be sent. Check the address and try again.";
}

export function launchAuthentication(
  mode: AuthMode = "sign-in",
  returnTo?: string,
) {
  dispatchEvent(
    new CustomEvent("komaplay:auth", {
      detail: { mode, returnTo },
    }),
  );
}

export function AuthDialog({
  initialMode,
  returnTo,
  config,
  onClose,
  initialError = "",
}: {
  initialMode: AuthMode;
  returnTo: string;
  config: BrowserSupabaseConfig | null;
  onClose: () => void;
  initialError?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<"email" | "google">("email");
  const pending = useRef(false);
  const [message, setMessage] = useState(initialError);
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const client = supabaseBrowser(config);

  useEffect(() => {
    email.current?.focus();
  }, [mode]);

  function trap(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...panel.current!.querySelectorAll<HTMLElement>(
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setMessage("");
    if (!client || !config) {
      setMessage("Authentication is unavailable on this deployment.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const emailAddress = String(form.get("email") ?? "").trim();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    pending.current = true;
    setProvider("email");
    setBusy(true);
    try {
      const destination = safeReturnPath(returnTo);
      const callback = authCallbackUrl(config.authCallbackOrigin, destination);
      const { error } = await client.auth.signInWithOtp({
        email: emailAddress,
        options: {
          emailRedirectTo: callback,
          shouldCreateUser: mode === "create",
          data:
            mode === "create"
              ? { display_name: String(form.get("displayName") ?? "").trim() }
              : undefined,
        },
      });
      setBusy(false);
      setMessage(
        error
          ? understandableAuthError(error)
          : "Check your email for a secure sign-in link. You can close this panel while you wait.",
      );
    } catch {
      setMessage(
        "We couldn’t send the sign-in email just now. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function google() {
    if (pending.current) return;
    if (!client || !config) {
      setMessage(
        "Sign-in is temporarily unavailable. Please try again shortly.",
      );
      return;
    }
    pending.current = true;
    setProvider("google");
    setBusy(true);
    setMessage("Opening Google sign-in…");
    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(config.authCallbackOrigin, returnTo),
          skipBrowserRedirect: true,
        },
      });
      if (error || !data.url) throw new Error("oauth_start");
      window.location.assign(data.url);
    } catch {
      setMessage(
        "We couldn’t open Google sign-in just now. Please try again or use an email link.",
      );
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      className="auth-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trap}
      >
        <button
          className="auth-close"
          onClick={onClose}
          aria-label="Close account dialog"
        >
          <X className="koma-icon" aria-hidden="true" />
        </button>
        <p className="editorial-marker">KOMA://PLAY ACCOUNT</p>
        <h2 id={titleId}>
          {mode === "sign-in" ? "SIGN IN" : "CREATE ACCOUNT"}
        </h2>
        <div className="auth-tabs" aria-label="Account action">
          <button
            type="button"
            aria-pressed={mode === "sign-in"}
            onClick={() => {
              setMode("sign-in");
              setMessage("");
            }}
          >
            SIGN IN
          </button>
          <button
            type="button"
            aria-pressed={mode === "create"}
            onClick={() => {
              setMode("create");
              setMessage("");
            }}
          >
            CREATE ACCOUNT
          </button>
        </div>
        <button
          type="button"
          className="op-button action-primary"
          disabled={busy}
          onClick={() => void google()}
        >
          {busy && provider === "google"
            ? "OPENING GOOGLE…"
            : "CONTINUE WITH GOOGLE"}
        </button>
        <p>
          Use Google or an email link. New members will read the Pocket Guide
          before contributing.
        </p>
        <form className="op-form" onSubmit={submit}>
          {mode === "create" && (
            <label>
              Display name
              <input
                name="displayName"
                required
                minLength={1}
                maxLength={80}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              ref={email}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
            />
          </label>
          {mode === "create" && (
            <label className="auth-consent">
              <input name="consent" type="checkbox" required />I agree to
              receive the one-time account email needed to create and access my
              KOMA://PLAY membership.
            </label>
          )}
          <button className="op-button action-primary" disabled={busy}>
            {busy && provider === "email"
              ? "SENDING…"
              : mode === "sign-in"
                ? "SEND SIGN-IN LINK"
                : "CREATE ACCOUNT"}
          </button>
          {message && (
            <p role={/^(Check|Opening)/.test(message) ? "status" : "alert"}>
              {message}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

export function AccountNav() {
  const data = useRouteLoaderData("root") as RootData | undefined;
  const auth = data?.auth ?? { state: "signed-out", member: null };
  const config = data?.supabase ?? null;
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [sessionArrived, setSessionArrived] = useState(false);
  const [dialog, setDialog] = useState<{
    mode: AuthMode;
    returnTo: string;
  } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const client = supabaseBrowser(config);

  useEffect(() => {
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") {
        if (session && auth.state === "signed-out") {setSessionArrived(true); void revalidator.revalidate();}
        return;
      }
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_OUT") setSessionArrived(false);
      setDialog(null);
      setMenuOpen(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "SIGNED_OUT")
        void revalidator.revalidate();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [client, revalidator]);

  useEffect(() => {
    const launch = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { mode?: AuthMode; returnTo?: string } | undefined)
          : undefined;
      setMenuOpen(false);
      setDialog({
        mode: detail?.mode === "create" ? "create" : "sign-in",
        returnTo: safeReturnPath(
          detail?.returnTo ?? location.pathname + location.search,
        ),
      });
    };
    const lock = () => {
      setDialog(null);
      setMenuOpen(false);
    };
    addEventListener("komaplay:auth", launch);
    addEventListener("komaplay:membership-lock", lock);
    return () => {
      removeEventListener("komaplay:auth", launch);
      removeEventListener("komaplay:membership-lock", lock);
    };
  }, [client, location.pathname, location.search, revalidator]);

  useEffect(() => {
    if (
      (auth.state === "signed-out" || auth.state === "unconfigured") &&
      ["expired", "cancelled", "unavailable"].includes(
        new URLSearchParams(location.search).get("auth_error") ?? "",
      )
    )
      setDialog({
        mode: "sign-in",
        returnTo: safeReturnPath(location.pathname + location.search),
      });
  }, [auth.state, location.pathname, location.search]);

  if (sessionArrived && auth.state === "signed-out") return <span role="status">Completing your sign-in…</span>;
  if (
    !data ||
    auth.state === "profile-unavailable" ||
    auth.state === "resolving" ||
    (auth.state === "authenticated" && data.membership?.status === "required")
  )
    return (
      <span className="account-placeholder" aria-label="Account unavailable" />
    );
  if (auth.state === "unconfigured" || auth.state === "signed-out")
    return (
      <>
        <button
          ref={button}
          className="account-signin action-primary"
          onClick={() =>
            setDialog({
              mode: "sign-in",
              returnTo: location.pathname + location.search,
            })
          }
        >
          SIGN IN
        </button>
        {dialog && (
          <AuthDialog
            initialMode={dialog.mode}
            returnTo={dialog.returnTo}
            config={config}
            initialError={
              new URLSearchParams(location.search).get("auth_error") ===
              "expired"
                ? "This sign-in link is invalid or expired. Request a new link."
                : new URLSearchParams(location.search).get("auth_error") ===
                    "cancelled"
                  ? "Sign-in was cancelled. You can try again whenever you’re ready."
                  : new URLSearchParams(location.search).get("auth_error") ===
                      "unavailable"
                    ? "We couldn’t complete sign-in just now. Please try again."
                    : ""
            }
            onClose={() => {
              setDialog(null);
              button.current?.focus();
            }}
          />
        )}
      </>
    );

  const member = auth.member;
  const initials =
    member.displayName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "KP";
  return (
    <div className="account-nav">
      {accountMessage && <p role="alert">{accountMessage}</p>}
      <button
        ref={button}
        aria-label={`Account menu for ${member.displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {initials}
      </button>
      {menuOpen && (
        <div className="account-menu" role="menu">
          <Link
            role="menuitem"
            to="/profile"
            onClick={() => setMenuOpen(false)}
          >
            VIEW PROFILE
          </Link>
          <Link
            role="menuitem"
            to="/profile/settings"
            onClick={() => setMenuOpen(false)}
          >
            SETTINGS
          </Link>
          <Link
            role="menuitem"
            to="/handbook"
            onClick={() => setMenuOpen(false)}
          >
            HANDBOOK
          </Link>
          {data.capabilities?.moderation && (
            <Link role="menuitem" to="/cover-editor" onClick={() => setMenuOpen(false)}>
              COVER EDITOR
            </Link>
          )}
          {data.capabilities?.moderation && (
            <Link
              role="menuitem"
              to="/moderation"
              onClick={() => setMenuOpen(false)}
            >
              REVIEW INBOX
            </Link>
          )}
          {data.capabilities?.admin && (
            <Link role="menuitem" to="/admin" onClick={() => setMenuOpen(false)}>
              ADMIN
            </Link>
          )}
          {data.capabilities?.editorial && (
            <Link
              role="menuitem"
              to="/editorial"
              onClick={() => setMenuOpen(false)}
            >
              EDITORIAL
            </Link>
          )}
          <button
            role="menuitem"
            onClick={async () => {
              if (!client || signingOut) return;
              setSigningOut(true);
              setAccountMessage("");
              try {
                const { error } = await client.auth.signOut({ scope: "local" });
                if (error) throw error;
                setMenuOpen(false);
                await revalidator.revalidate();
                navigate("/", { replace: true });
              } catch {
                setAccountMessage(
                  "We couldn’t sign you out just now. Please try again.",
                );
              } finally {
                setSigningOut(false);
              }
            }}
            disabled={signingOut}
          >
            {signingOut ? "SIGNING OUT…" : "SIGN OUT"}
          </button>
        </div>
      )}
    </div>
  );
}
