"use client";
import { useState } from "react";
import { AuthGate } from "../open-panel/AuthGate";
import {
  correctionKinds,
  correctionSchema,
} from "../../lib/publication/validation";
import { publishingApi } from "../../lib/publication/api";
export function CorrectionReportForm({
  featureId,
  demo = false,
}: {
  featureId: string;
  demo?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthGate>
      {() =>
        demo ? (
          <p>Connect Supabase to submit a private correction report.</p>
        ) : (
          <form
            className="op-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              setBusy(true);
              setError("");
              try {
                const payload = correctionSchema.parse({
                  ...Object.fromEntries(new FormData(form)),
                  feature_id: featureId,
                });
                await publishingApi("correction", payload);
                form.reset();
                setMessage(
                  "Your private correction report has been sent to the editorial team.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              This report is private between you and moderators. It does not
              reopen the Workshop. Limit: three reports per hour.
            </p>
            <label>
              Concern
              <select name="kind">
                {correctionKinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              What needs correcting?
              <textarea
                name="body"
                required
                minLength={20}
                maxLength={4000}
                rows={6}
              />
            </label>
            <label>
              Supporting source (optional)
              <input name="source_url" type="url" placeholder="https://" />
            </label>
            <button disabled={busy}>
              {busy ? "Sending…" : "Send private correction"}
            </button>
            {message && <p role="status">{message}</p>}
            {error && <p role="alert">{error}</p>}
          </form>
        )
      }
    </AuthGate>
  );
}
