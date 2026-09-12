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
import type { AuthSnapshot } from "../lib/auth";
import {
  supabaseBrowser,
  type BrowserSupabaseConfig,
} from "../lib/browser-supabase";
import { safeReturnPath } from "../lib/handbook";

type RootData = {
  auth: AuthSnapshot;
  membership?: { status: string };
  capabilities?: { editorial: boolean; moderation: boolean };
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
    if (busy) return;
    setMessage("");
    if (!client) {
      setMessage("Authentication is unavailable on this deployment.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const emailAddress = String(form.get("email") ?? "").trim();
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setBusy(true);
    const destination = safeReturnPath(returnTo);
    const callback = new URL("/auth/callback", location.origin);
    callback.searchParams.set("returnTo", destination);
    const { error } = await client.auth.signInWithOtp({
      email: emailAddress,
      options: {
        emailRedirectTo: callback.toString(),
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
          ×
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
            {busy
              ? "SENDING…"
              : mode === "sign-in"
                ? "SEND SIGN-IN LINK"
                : "CREATE ACCOUNT"}
          </button>
          {message && (
            <p role={message.startsWith("Check") ? "status" : "alert"}>
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
  const [dialog, setDialog] = useState<{
    mode: AuthMode;
    returnTo: string;
  } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const client = supabaseBrowser(config);

  useEffect(() => {
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      setDialog(null);
      setMenuOpen(false);
      if (event === "SIGNED_IN" || event === "USER_UPDATED")
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
      new URLSearchParams(location.search).get("auth_error") === "expired"
    )
      setDialog({ mode: "sign-in", returnTo: location.pathname });
  }, [auth.state, location.pathname, location.search]);

  if (
    !data ||
    auth.state === "profile-unavailable" ||
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
            <span role="menuitem" aria-disabled="true">
              MODERATION · MIGRATING
            </span>
          )}
          {data.capabilities?.editorial && (
            <span role="menuitem" aria-disabled="true">
              EDITORIAL · MIGRATING
            </span>
          )}
          <button
            role="menuitem"
            onClick={async () => {
              if (!client) return;
              setMenuOpen(false);
              await client.auth.signOut();
              await revalidator.revalidate();
              navigate("/", { replace: true });
            }}
          >
            SIGN OUT
          </button>
        </div>
      )}
    </div>
  );
}
