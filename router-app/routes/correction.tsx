import { data, Form, Link, redirect, useActionData } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/correction";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";
import { catalogue } from "../lib/publication.server";
import { acceptsContributions } from "../lib/publication";
import { safeUrl } from "../lib/open-panel";

const correctionSchema = z.object({
  kind: z.enum([
    "Factual error",
    "Incorrect attribution",
    "Broken source",
    "Safety concern",
    "Legal or rights concern",
  ]),
  body: z.string().trim().min(20).max(4000),
  source: z
    .string()
    .max(2000)
    .refine((value) => !value || safeUrl(value), "Use a safe HTTPS source URL.")
    .default(""),
});

async function context(request: Request, slug?: string) {
  const all = await catalogue();
  const feature = all.features.find((item) => item.slug === slug);
  if (!feature) throw data("Feature not found", { status: 404 });
  const issue = all.issues.find((item) => item.id === feature.issue_id)!;
  const resolved = await resolveAuth(request);
  let state:
    | "signed-out"
    | "required"
    | "accepted"
    | "restricted"
    | "suspended"
    | "unavailable" = "signed-out";
  if (
    resolved.auth.state === "authenticated" &&
    resolved.client &&
    resolved.user
  ) {
    state =
      resolved.auth.member.accountStatus === "active"
        ? (await membershipState(resolved.client, resolved.user.id)).status
        : resolved.auth.member.accountStatus;
  } else if (resolved.auth.state === "profile-unavailable")
    state = "unavailable";
  return { all, feature, issue, resolved, state };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const value = await context(request, params.slug);
  if (
    value.state === "accepted" &&
    acceptsContributions(value.feature, value.issue, value.all.now)
  )
    return redirect(`/features/${value.feature.slug}/workshop`, {
      headers: value.resolved.headers,
    });
  return data(
    { feature: value.feature, state: value.state },
    { headers: value.resolved.headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  const value = await context(request, params.slug);
  if (value.state !== "accepted" || !value.resolved.client)
    return data(
      { error: "Current active membership is required." },
      { status: 403, headers: value.resolved.headers },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return data(
      { error: "Same-origin request required." },
      { status: 403, headers: value.resolved.headers },
    );
  const parsed = correctionSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success)
    return data(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") },
      { status: 400, headers: value.resolved.headers },
    );
  const saved = await value.resolved.client.rpc("submit_correction", {
    target: value.feature.id,
    report_kind: parsed.data.kind,
    report_body: parsed.data.body,
    source: parsed.data.source,
  });
  return saved.error
    ? data(
        { error: "The correction could not be submitted. Please retry." },
        { status: 409, headers: value.resolved.headers },
      )
    : data(
        { success: "Correction submitted privately for editorial review." },
        { headers: value.resolved.headers },
      );
}

export default function Correction({ loaderData }: Route.ComponentProps) {
  const result = useActionData<typeof action>();
  const returnTo = `/features/${loaderData.feature.slug}/correction`;
  return (
    <main className="editorial-page">
      <Masthead slug={loaderData.feature.slug} />
      <IssueNavigation />
      <div className="op-workspace">
        <Link to={`/features/${loaderData.feature.slug}`}>
          ← RETURN TO COMMUNITY EDITION
        </Link>
        <p className="op-eyebrow editorial-marker">PRIVATE CORRECTION</p>
        <h1>Report a correction</h1>
        {loaderData.state === "signed-out" && (
          <SignedOutMemberBoundary
            title="SIGN IN TO REPORT A CORRECTION"
            returnTo={returnTo}
          />
        )}
        {loaderData.state === "required" && (
          <p role="status">VERIFYING MEMBERSHIP…</p>
        )}
        {(loaderData.state === "restricted" ||
          loaderData.state === "suspended") && (
          <p className="op-notice">
            Correction access is unavailable for this account. Contact the
            editorial team for help or an appeal.
          </p>
        )}
        {loaderData.state === "unavailable" && (
          <p className="op-notice">
            Membership could not be verified. Please retry later.
          </p>
        )}
        {loaderData.state === "accepted" && (
          <Form method="post" className="op-form">
            <p>
              This report is private and is not published as a Workshop
              proposal.
            </p>
            <label>
              Correction type
              <select name="kind" defaultValue="Factual error">
                <option>Factual error</option>
                <option>Incorrect attribution</option>
                <option>Broken source</option>
                <option>Safety concern</option>
                <option>Legal or rights concern</option>
              </select>
            </label>
            <label>
              What should be corrected?
              <textarea
                name="body"
                minLength={20}
                maxLength={4000}
                required
                rows={7}
              />
            </label>
            <label>
              Supporting source (optional)
              <input name="source" type="url" placeholder="https://" />
            </label>
            <button className="action-primary">
              SUBMIT PRIVATE CORRECTION
            </button>
            {result && "error" in result && <p role="alert">{result.error}</p>}
            {result && "success" in result && (
              <p role="status">{result.success}</p>
            )}
          </Form>
        )}
      </div>
    </main>
  );
}
