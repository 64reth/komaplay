"use client";
import { useEffect, useRef, useState } from "react";
import { AuthGate } from "./AuthGate";
import { ContributionComposer } from "./ContributionComposer";
import { ContributionCard } from "./ContributionCard";
import { ContributionFilters, type Filters } from "./ContributionFilters";
import { api } from "../../lib/open-panel/api";
import type { HandbookState } from "../../lib/handbook/domain";
import type { Contribution } from "../../lib/open-panel/domain";
export function OpenPanelWorkshop({
  featureId,
  readOnly = false,
  featureTitle,
}: {
  featureId: string | null;
  readOnly?: boolean;
  featureTitle?: string;
}) {
  return (
    <AuthGate
      embeddedForm={false}
      signedOut={
        <section className="workshop-entry">
          <p className="op-eyebrow editorial-marker">ENTER THE WORKSHOP</p>
          <h2>You’re adding to “{featureTitle}”.</h2>
          <p>
            Sign in or create an account to submit knowledge, experience or
            evidence for its next revision.
          </p>
          <p className="op-actions">
            <button
              className="action-primary"
              onClick={() => dispatchEvent(new Event("komaplay:auth"))}
            >
              SIGN IN
            </button>
            <button onClick={() => dispatchEvent(new Event("komaplay:auth"))}>
              CREATE ACCOUNT
            </button>
          </p>
        </section>
      }
    >
      {() =>
        featureId ? (
          <HandbookWorkshop featureId={featureId} readOnly={readOnly} />
        ) : (
          <p className="op-notice">
            This feature needs its Supabase record before contributions can be
            submitted. Apply the migration from README.
          </p>
        )
      }
    </AuthGate>
  );
}
function HandbookWorkshop({
  featureId,
  readOnly,
}: {
  featureId: string;
  readOnly: boolean;
}) {
  const [state, setState] = useState<HandbookState | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/handbook/status", { cache: "no-store" })
      .then(async (response) => {
        const value = (await response.json()) as HandbookState & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            value.error ?? "Unable to check handbook acceptance.",
          );
        if (live) setState(value);
      })
      .catch(() => {
        if (live)
          setState({
            status: "unavailable",
            version: null,
            acceptance: null,
            message:
              "The community handbook could not be checked. Please retry.",
          });
      });
    return () => {
      live = false;
    };
  }, []);
  if (!state) return <p role="status">VERIFYING WORKSHOP ACCESS…</p>;
  if (state.status === "unavailable")
    return (
      <p className="op-notice" role="alert">
        {state.message}
      </p>
    );
  if (state.status === "required")
    return <p role="status">VERIFYING MEMBERSHIP…</p>;
  return <Workshop featureId={featureId} readOnly={readOnly} />;
}

function Workshop({
  featureId,
  readOnly,
  accessGranted = false,
}: {
  featureId: string;
  readOnly: boolean;
  accessGranted?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (accessGranted) heading.current?.focus();
  }, [accessGranted]);
  const [filters, setFilters] = useState<Filters>({
    type: "",
    status: "",
    feature_id: featureId,
    date: "",
  });
  const [items, setItems] = useState<Contribution[]>([]);
  const [editing, setEditing] = useState<Contribution>();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    api<{ contributions: Contribution[]; count: number }>(
      `mine?${new URLSearchParams({ ...filters, page: String(page) })}`,
    )
      .then((data) => {
        if (live) {
          setItems(data.contributions);
          setCount(data.count);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [filters, version, page]);
  return (
    <>
      <section className="workshop-workbench">
        {accessGranted && (
          <p className="op-notice" role="status" aria-live="polite">
            WORKSHOP ACCESS GRANTED
          </p>
        )}
        <p className="op-eyebrow">AT THE WORKBENCH</p>
        <h2 ref={heading} tabIndex={-1}>
          Developing the next revision
        </h2>
        <p>
          Recent, privacy-safe activity appears here as members develop this
          feature. No presence tracking or follower counts are used.
        </p>
      </section>
      {!readOnly && (
        <ContributionComposer
          key={editing?.id ?? "new"}
          featureId={featureId}
          existing={editing}
          onCancel={editing ? () => setEditing(undefined) : undefined}
          onSaved={() => {
            setEditing(undefined);
            setMessage(
              "Contribution submitted. It is waiting for moderator review.",
            );
            setVersion((v) => v + 1);
          }}
        />
      )}
      {message && (
        <p role="status" className="op-notice">
          {message}
        </p>
      )}
      <h2>Your contributions</h2>
      <ContributionFilters
        value={filters}
        onChange={(v) => {
          setFilters(v);
          setPage(0);
        }}
      />
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading your contributions…</p>
      ) : items.length ? (
        items.map((item) => (
          <ContributionCard
            key={item.id}
            item={item}
            onEdit={
              readOnly
                ? undefined
                : () => {
                    setEditing(item);
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }
            }
            onWithdraw={
              readOnly
                ? undefined
                : async () => {
                    if (
                      !window.confirm("Withdraw this contribution from review?")
                    )
                      return;
                    try {
                      await api("withdraw", { id: item.id });
                      setMessage("Contribution withdrawn.");
                      setVersion((v) => v + 1);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }
            }
          />
        ))
      ) : (
        <p>
          No contributions match these filters. Your next useful observation can
          start here.
        </p>
      )}
      <div className="op-actions">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={(page + 1) * 25 >= count}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
