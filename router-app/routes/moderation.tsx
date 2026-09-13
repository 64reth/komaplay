import { data, Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/moderation";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { Masthead } from "../components/Masthead";
import { PanelDirectory, type PanelDirectoryRow } from "../components/PanelDirectory";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { reviewInboxStatusLabel } from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";

async function moderationContext(request: Request) {
  const resolved = await resolveAuth(request);
  if (resolved.auth.state !== "authenticated" || !resolved.client || !resolved.user) return { resolved, state: "signed-out" as const, capabilities: { editorial: false, moderation: false } };
  if (resolved.auth.member.accountStatus !== "active") return { resolved, state: resolved.auth.member.accountStatus as "restricted" | "suspended", capabilities: { editorial: false, moderation: false } };
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted") return { resolved, state: "verifying" as const, capabilities: { editorial: false, moderation: false } };
  const capabilities = await memberCapabilities(resolved.client, resolved.auth.member);
  const review = await resolved.client.rpc("editorial_has_access", { target: resolved.user.id, review: false });
  const allowed = capabilities.editorial || capabilities.moderation || (!review.error && review.data === true);
  return { resolved, state: allowed ? "accepted" as const : "denied" as const, capabilities };
}

export async function loader({ request }: Route.LoaderArgs) {
  const context = await moderationContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client) return data({ state: context.state, capabilities: context.capabilities, grants: [], review: [] }, { headers: resolved.headers });
  const [grants, review, publication] = await Promise.all([
    resolved.client.from("editorial_access_grants").select("id,access_level,scope_type,granted_at,revoked_at,reason,profiles!editorial_access_grants_user_id_fkey(display_name)").order("granted_at", { ascending: false }),
    resolved.client.rpc("editorial_review_inbox"),
    resolved.client.rpc("editorial_publication_panels"),
  ]);
  return data({ state: "accepted" as const, capabilities: context.capabilities, grants: grants.error ? [] : grants.data ?? [], review: review.error ? [] : review.data ?? [], publication: publication.error ? [] : publication.data ?? [] }, { headers: resolved.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const context = await moderationContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client) return data({ error: "Moderation access is required." }, { status: 403, headers: resolved.headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return data({ error: "Same-origin request required." }, { status: 403, headers: resolved.headers });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "grant" || intent === "revoke") {
      const email = String(form.get("email") ?? "").trim();
      if (!email || !email.includes("@")) throw new Error("Enter an existing user email.");
      const result = await resolved.client.rpc("manage_editorial_grant", { target_email: email, grant_access: intent === "grant", grant_reason: String(form.get("reason") ?? "") });
      if (result.error) throw new Error(result.error.message);
      return data({ success: intent === "grant" ? "Editorial access granted." : "Editorial access revoked." }, { headers: resolved.headers });
    }
    if (intent === "publishFeature" || intent === "takeDownFeature") {
      if (!context.capabilities.moderation) return data({ error: "Moderator access is required to publish or take down panels." }, { status: 403, headers: resolved.headers });
      const featureId = String(form.get("featureId") ?? "");
      const rpcName = intent === "publishFeature" ? "publish_editorial_panel" : "take_down_editorial_panel";
      const result = await resolved.client.rpc(rpcName, { target: featureId });
      if (result.error) throw new Error(result.error.message);
      return data({ success: intent === "publishFeature" ? "Feature published." : "Feature taken down." }, { headers: resolved.headers });
    }
    if (intent === "approveDraft" || intent === "changesDraft") {
      if (!context.capabilities.moderation) return data({ error: "Moderator access is required to approve or request changes." }, { status: 403, headers: resolved.headers });
      const note = String(form.get("note") ?? "").trim();
      if (intent === "changesDraft" && note.length < 4) throw new Error("Add a reviewer note before requesting changes.");
      const result = await resolved.client.rpc("editorial_review_draft", { target: String(form.get("featureId") ?? ""), decision: intent === "approveDraft" ? "approve" : "changes", review_note: note });
      if (result.error) throw new Error(result.error.message);
      return data({ success: intent === "approveDraft" ? "Panel marked publish-ready." : "Changes requested." }, { headers: resolved.headers });
    }
    throw new Error("Unknown moderation action.");
  } catch (error) {
    return data({ error: error instanceof Error ? error.message : "Action failed." }, { status: 400, headers: resolved.headers });
  }
}

function Boundary({ state }: { state: string }) {
  if (state === "signed-out") return <SignedOutMemberBoundary title="SIGN IN TO USE MODERATION" returnTo="/moderation" />;
  return <section className="op-workspace"><p className="editorial-marker">MODERATION</p><h1>Moderation unavailable</h1><p role="alert">Administrator, moderator or review permission is required.</p><Link to="/profile">← RETURN TO PROFILE</Link></section>;
}

export default function Moderation() {
  const result = useLoaderData<typeof loader>();
  const actionResult = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  if (result.state !== "accepted") return <main className="editorial-page"><Masthead /><Boundary state={result.state} /></main>;
  const selectedReviewId = searchParams.get("review") ?? "";
  const selectedReview = result.review.find((draft: any) => draft.feature_id === selectedReviewId) ?? null;
  const publicationRows: PanelDirectoryRow[] = ("publication" in result ? result.publication : []).map((draft: any) => ({
    id: `publication-${draft.feature_id}`,
    title: draft.title ?? "Untitled panel",
    type: "Editorial Feature",
    status: reviewInboxStatusLabel(draft.lifecycle_status),
    date: new Date(draft.updated_at).toLocaleDateString("en-GB"),
    meta: `${draft.author_display_name ?? "Panelist"} · ${draft.slug ?? ""}`,
    action: draft.lifecycle_status === "publish_ready" ? (
      <Form method="post">
        <input type="hidden" name="featureId" value={draft.feature_id} />
        <button className="op-button action-primary" name="intent" value="publishFeature" disabled={navigation.state !== "idle"}>PUBLISH FEATURE</button>
      </Form>
    ) : draft.lifecycle_status === "published" ? (
      <Form method="post">
        <input type="hidden" name="featureId" value={draft.feature_id} />
        <button className="op-button" name="intent" value="takeDownFeature" disabled={navigation.state !== "idle"}>TAKE DOWN</button>
      </Form>
    ) : <span>{draft.lifecycle_status === "taken_down" ? "TAKEN DOWN" : "NO PUBLIC ACTION"}</span>,
  }));
  const reviewRows: PanelDirectoryRow[] = result.review.map((draft: any) => ({
    id: draft.feature_id,
    title: draft.title ?? "Untitled submitted panel",
    type: "Editorial Feature",
    status: reviewInboxStatusLabel(draft.lifecycle_status),
    date: new Date(draft.updated_at).toLocaleDateString("en-GB"),
    meta: `${draft.author_display_name ?? "Panelist"} · ${draft.summary ?? ""}`,
    action: <Link to={`/moderation?review=${draft.feature_id}#review-preview`}>REVIEW ↓</Link>,
  }));
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace profile-page">
        <nav className="profile-actions" aria-label="Moderation actions">
          <Link to="/profile">← RETURN TO PROFILE</Link>
          <Link to="/editorial">EDITORIAL DASHBOARD</Link>
          <Link to="/">VIEW PUBLICATION</Link>
        </nav>
        <p className="editorial-marker">MODERATION</p>
        <h1>Editorial access and review</h1>
        {result.capabilities.moderation && (
          <section>
            <h2>Editorial grants</h2>
            <Form className="op-form" method="post">
              <label>User email<input name="email" type="email" required /></label>
              <label>Reason<input name="reason" maxLength={240} /></label>
              <div className="profile-actions">
                <button className="op-button action-primary" name="intent" value="grant" disabled={navigation.state !== "idle"}>GRANT EDITORIAL ACCESS</button>
                <button className="op-button" name="intent" value="revoke" disabled={navigation.state !== "idle"}>REVOKE EDITORIAL ACCESS</button>
              </div>
            </Form>
            <div>{result.grants.length ? result.grants.map((grant) => <p key={grant.id}>{grant.revoked_at ? "Revoked" : "Active"} · {grant.access_level} · {((Array.isArray((grant as any).profiles) ? (grant as any).profiles[0] : (grant as any).profiles)?.display_name) ?? "Member"}</p>) : <p>No editorial grants found.</p>}</div>
          </section>
        )}
        {actionResult && "error" in actionResult && <p role="alert">{actionResult.error}</p>}
        {actionResult && "success" in actionResult && <p role="status">{actionResult.success}</p>}
        <section>
          <h2>REVIEW INBOX</h2>
          <p>Publishing to the live strip is next. Publish-ready panels are not public yet.</p>
          <PanelDirectory label="Review Inbox" rows={reviewRows} empty="No submitted drafts waiting." />
          {result.capabilities.moderation && (
            <>
              <h2>PUBLICATION CONTROLS</h2>
              <p>Publish-ready panels can become public features. Published panels can be taken down without deleting history.</p>
              <PanelDirectory label="Publication controls" rows={publicationRows} empty="No publish-ready or published panels yet." />
            </>
          )}
          <section id="review-preview" className="review-preview-shell" aria-label="Review preview">
            <p className="editorial-marker">REVIEW PREVIEW</p>
            {selectedReview ? (
              <>
                <header className="review-preview-header">
                  <div>
                    <h3>{selectedReview.title}</h3>
                    <p>{selectedReview.summary}</p>
                  </div>
                  <dl className="review-preview-meta">
                    <div><dt>Author</dt><dd>{selectedReview.author_display_name ?? "Panelist"}</dd></div>
                    <div><dt>Status</dt><dd><span className="panel-status">{reviewInboxStatusLabel(selectedReview.lifecycle_status)}</span></dd></div>
                    <div><dt>Updated</dt><dd>{new Date(selectedReview.updated_at).toLocaleDateString("en-GB")}</dd></div>
                  </dl>
                </header>
                <div className="review-article-frame">
                  <ArticleRenderer document={selectedReview.working_document as any} />
                </div>
                <aside className="review-decision-desk" aria-label="Reviewer decision controls">
                  <div>
                    <h4>Reviewer note</h4>
                    <p>Use the note to explain requested changes clearly. Approval marks the panel publish-ready only; it does not publish it live.</p>
                  </div>
                  {result.capabilities.moderation ? (
                    <Form method="post" className="op-form review-decision-form">
                      <input type="hidden" name="featureId" value={selectedReview.feature_id} />
                      <label>Reviewer note<textarea name="note" minLength={4} maxLength={240} rows={3} placeholder="Explain what needs to change before this can move forward." /></label>
                      <div className="profile-actions">
                        {selectedReview.lifecycle_status === "publish_ready" || selectedReview.lifecycle_status === "approved" ? <span>Publishing to the live strip is next. This panel is publish-ready.</span> : <button className="op-button action-primary" name="intent" value="approveDraft">APPROVE AS PUBLISH-READY</button>}
                        <button className="op-button" name="intent" value="changesDraft">REQUEST CHANGES</button>
                      </div>
                    </Form>
                  ) : <p>Editors can view the shared Review Inbox. Moderator access is required to approve or request changes.</p>}
                </aside>
              </>
            ) : (
              <p className="preview-empty">Select a submitted panel to review.</p>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
