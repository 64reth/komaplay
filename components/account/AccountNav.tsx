"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "../../lib/supabase/client";
type Member = { id: string; display_name: string; role: string };
function AuthDialog({
  onClose,
  initialMode = "sign-in",
}: {
  onClose: () => void;
  initialMode?: "sign-in" | "create";
}) {
  const [mode, setMode] = useState<"sign-in" | "create">(initialMode),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const client = browserClient();
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const { error } = await client.auth.signInWithOtp({
      email: String(form.get("email")),
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm?next=${encodeURIComponent(location.pathname + location.search)}`,
        data:
          mode === "create" ? { display_name: String(form.get("name")) } : {},
      },
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your email for a sign-in link.");
  };
  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          className="auth-close"
          onClick={onClose}
          aria-label="Close sign in"
        >
          ×
        </button>
        <p className="op-eyebrow">KOMA://PLAY ACCOUNT</p>
        <h2 id="auth-title">
          {mode === "sign-in" ? "SIGN IN" : "CREATE ACCOUNT"}
        </h2>
        <div className="auth-tabs">
          <button
            aria-pressed={mode === "sign-in"}
            onClick={() => setMode("sign-in")}
          >
            SIGN IN
          </button>
          <button
            aria-pressed={mode === "create"}
            onClick={() => setMode("create")}
          >
            CREATE ACCOUNT
          </button>
        </div>
        <form className="op-form" onSubmit={submit}>
          {mode === "create" && (
            <label>
              Display name
              <input name="name" required maxLength={80} />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button className="action-primary" disabled={busy}>
            {busy
              ? "SENDING…"
              : mode === "sign-in"
                ? "SIGN IN"
                : "CREATE ACCOUNT"}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
    </div>
  );
}
export function AccountMenuLinks({
  role,
  onNavigate,
}: {
  role: string;
  onNavigate: () => void;
}) {
  return (
    <>
      <Link
        role="menuitem"
        href="/profile"
        prefetch={false}
        onClick={onNavigate}
      >
        VIEW PROFILE
      </Link>
      <Link
        role="menuitem"
        href="/profile#contributions"
        prefetch={false}
        onClick={onNavigate}
      >
        MY CONTRIBUTIONS
      </Link>
      <Link
        role="menuitem"
        href="/handbook"
        prefetch={false}
        onClick={onNavigate}
      >
        HANDBOOK
      </Link>
      <Link
        role="menuitem"
        href="/profile/settings"
        prefetch={false}
        onClick={onNavigate}
      >
        SETTINGS
      </Link>
      {["moderator", "admin"].includes(role) && (
        <Link
          role="menuitem"
          href="/moderation"
          prefetch={false}
          onClick={onNavigate}
        >
          MODERATION
        </Link>
      )}
      {role === "admin" && (
        <Link
          role="menuitem"
          href="/publishing"
          prefetch={false}
          onClick={onNavigate}
        >
          PUBLISHING
        </Link>
      )}
    </>
  );
}

export function AccountNav() {
  const [user, setUser] = useState<Member | null>(null),
    [ready, setReady] = useState(false),
    [open, setOpen] = useState(false),
    [auth, setAuth] = useState(false),
    [authMode, setAuthMode] = useState<"sign-in" | "create">("sign-in");
  const button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const client = browserClient();
  useEffect(() => {
    let live = true;
    const load = async () => {
      const r = await fetch("/api/open-panel/session", { cache: "no-store" });
      const d = (await r.json()) as { user?: Member };
      if (live) {
        setUser(r.ok ? (d.user ?? null) : null);
        setReady(true);
        if (r.ok) setAuth(false);
      }
    };
    void load();
    const sub = client?.auth.onAuthStateChange(() => void load());
    const launch = (event: Event) => {
      const mode =
        event instanceof CustomEvent && event.detail?.mode === "create"
          ? "create"
          : "sign-in";
      setAuthMode(mode);
      setAuth(true);
    };
    const lock = () => setOpen(false);
    addEventListener("komaplay:auth", launch);
    addEventListener("komaplay:membership-lock", lock);
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
      removeEventListener("komaplay:auth", launch);
      removeEventListener("komaplay:membership-lock", lock);
    };
  }, [client]);
  if (!ready) return <span className="account-placeholder" />;
  if (!user)
    return (
      <>
        <button
          className="account-signin action-primary"
          onClick={() => {
            setAuthMode("sign-in");
            setAuth(true);
          }}
        >
          SIGN IN
        </button>
        {auth && (
          <AuthDialog initialMode={authMode} onClose={() => setAuth(false)} />
        )}
      </>
    );
  const initials = user.display_name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="account-nav">
      <button
        ref={button}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (document.body.classList.contains("membership-onboarding-open"))
            return;
          setOpen((value) => !value);
        }}
      >
        {initials}
      </button>
      {open && (
        <div ref={menu} role="menu" className="account-menu">
          <AccountMenuLinks
            role={user.role}
            onNavigate={() => setOpen(false)}
          />
          <button
            role="menuitem"
            onClick={async () => {
              await client?.auth.signOut();
              setUser(null);
              setOpen(false);
              location.assign("/");
            }}
          >
            SIGN OUT
          </button>
        </div>
      )}
    </div>
  );
}
