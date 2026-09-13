import { useEffect, useMemo, useState } from "react";
import { data, Form, Link, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/editorial";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { Masthead } from "../components/Masthead";
import { PanelDirectory, type PanelDirectoryRow } from "../components/PanelDirectory";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { composerFromWorkItem, draftDocument, draftSchema, documentBodyText, editorialStatusLabel, myPanelsStatusLabel, reviewInboxStatusLabel, type EditorialWorkItem } from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";


async function editorialContext(request: Request, review = false) {
  const resolved = await resolveAuth(request);
  if (resolved.auth.state !== "authenticated" || !resolved.client || !resolved.user) {
    return { resolved, state: "signed-out" as const, capabilities: { editorial: false, moderation: false } };
  }
  if (resolved.auth.member.accountStatus !== "active") {
    return { resolved, state: resolved.auth.member.accountStatus as "restricted" | "suspended", capabilities: { editorial: false, moderation: false } };
  }
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted") {
    return { resolved, state: "verifying" as const, capabilities: { editorial: false, moderation: false } };
  }
  const capabilities = await memberCapabilities(resolved.client, resolved.auth.member);
  const rpc = await resolved.client.rpc("editorial_has_access", { target: resolved.user.id, review });
  const allowed = !rpc.error && rpc.data === true;
  return { resolved, state: allowed || capabilities.editorial ? "accepted" as const : "denied" as const, capabilities };
}

export async function loader({ request }: Route.LoaderArgs) {
  const context = await editorialContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client) {
    return data({ state: context.state, capabilities: context.capabilities, categories: [], drafts: [], review: [] }, { headers: resolved.headers });
  }
  const [categories, drafts, review] = await Promise.all([
    resolved.client.from("categories").select("id,name,slug").order("name"),
    resolved.client.rpc("editorial_my_work"),
    resolved.client.rpc("editorial_review_inbox"),
  ]);
  return data(
    { state: "accepted" as const, capabilities: context.capabilities, categories: categories.data ?? [], drafts: drafts.error ? [] : drafts.data ?? [], review: review.error ? [] : review.data ?? [] },
    { headers: resolved.headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const context = await editorialContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client) return data({ error: "Editorial access is required." }, { status: 403, headers: resolved.headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return data({ error: "Same-origin request required." }, { status: 403, headers: resolved.headers });
  try {
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "save");
    if (intent === "submit-existing" || intent === "submitExisting" || (intent === "submit" && !form.has("title"))) {
      const featureId = String(form.get("featureId") ?? "");
      if (!featureId) throw new Error("Saved panel id is missing. Reload and try again.");
      const saved = await resolved.client.rpc("submit_editorial_draft", { target: featureId });
      if (saved.error) throw new Error(saved.error.message);
      return data({ success: "Submitted for review. Editors can now see this in the Review Inbox.", featureId: saved.data, status: "submitted" }, { headers: resolved.headers });
    }
    const value = draftSchema.parse({
      featureId: form.get("featureId") ?? "",
      title: form.get("title"),
      slug: form.get("slug"),
      summary: form.get("summary"),
      categoryId: form.get("categoryId") ?? "",
      image: form.get("image") ?? "",
      imageAlt: form.get("imageAlt") ?? "",
      sections: form.get("sections"),
      videoUrl: form.get("videoUrl") ?? "",
      status: intent === "submit" ? "submitted" : String(form.get("currentStatus") ?? "") === "changes_requested" ? "changes_requested" : "draft",
    });
    if (value.image && !value.imageAlt) throw new Error("Image alt text is required when an image is provided.");
    const document = draftDocument(value);
    const saved = await resolved.client.rpc("save_editorial_draft", {
      payload: { feature_id: value.featureId || "", title: value.title, slug: value.slug, summary: value.summary, category_id: value.categoryId || "", image: value.image, image_alt: value.imageAlt, body: documentBodyText(value.sections), status: value.status, document },
    });
    if (saved.error) throw new Error(saved.error.message);
    return data({ success: intent === "submit" ? "Submitted for review. Editors can now see this in the Review Inbox." : "Draft saved. You can leave and return from MY PANELS.", featureId: saved.data, status: value.status }, { headers: resolved.headers });
  } catch (error) {
    return data({ error: error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(" ") : error instanceof Error ? error.message : "Draft could not be saved." }, { status: 400, headers: resolved.headers });
  }
}

function Boundary({ state }: { state: string }) {
  if (state === "signed-out") return <SignedOutMemberBoundary title="SIGN IN TO USE EDITORIAL" returnTo="/editorial" />;
  return (
    <section className="op-workspace">
      <p className="editorial-marker">EDITORIAL ACCESS</p>
      <h1>Editorial dashboard unavailable</h1>
      <p role="alert">Active membership and editorial permission are required.</p>
      <Link to="/profile">← RETURN TO PROFILE</Link>
    </section>
  );
}

type ComposerState = z.infer<typeof draftSchema>;

type AcceptedLoaderData = {
  state: "accepted";
  capabilities: { editorial: boolean; moderation: boolean };
  categories: Array<{ id: string; name: string; slug: string }>;
  drafts: EditorialWorkItem[];
  review: any[];
};

const initialComposer: ComposerState = {
  featureId: "",
  title: "",
  slug: "",
  summary: "",
  categoryId: "",
  image: "",
  imageAlt: "",
  sections: "",
  videoUrl: "",
  status: "draft",
};

function FeatureComposer({ result, selectedFeatureId }: { result: AcceptedLoaderData; selectedFeatureId: string }) {
  const routeActionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<ComposerState>(() => {
    const selected = result.drafts.find((item) => item.feature_id === selectedFeatureId);
    return selected ? composerFromWorkItem(selected) : initialComposer;
  });
  const [submitIntent, setSubmitIntent] = useState<"save" | "submit">("save");
  const [slugEdited, setSlugEdited] = useState(Boolean(selectedFeatureId));
  const pending = navigation.state !== "idle";
  const response = routeActionData;
  const actionFeatureId = response && "featureId" in response && typeof response.featureId === "string" ? response.featureId : "";
  const selected = result.drafts.find((item) => item.feature_id === draft.featureId);
  const selectedStatus = response && "status" in response && typeof response.status === "string" ? response.status : selected?.lifecycle_status ?? draft.status;
  const durableStatus = response && "success" in response && response.status === "draft" ? "Draft saved" : editorialStatusLabel(selectedStatus);
  const isSubmitted = selectedStatus === "submitted";
  const isPublishReady = selectedStatus === "publish_ready" || selectedStatus === "approved";
  const isChangesRequested = selectedStatus === "changes_requested";
  const hasComposerContent = Boolean(draft.title.trim() || draft.summary.trim() || draft.sections.trim());
  const imageAltError = Boolean(draft.image && !draft.imageAlt);
  const slugError = Boolean(draft.slug && !/^[a-z0-9-]{3,80}$/.test(draft.slug));

  useEffect(() => {
    const selectedWork = result.drafts.find((item) => item.feature_id === selectedFeatureId);
    if (selectedWork) {
      setDraft(composerFromWorkItem(selectedWork));
      setSlugEdited(true);
    }
  }, [result.drafts, selectedFeatureId]);

  useEffect(() => {
    if (response && "featureId" in response && typeof response.featureId === "string") {
      setDraft((current) => ({
        ...current,
        featureId: response.featureId,
        status: typeof response.status === "string" ? response.status as any : current.status,
      }));
    }
  }, [response]);

  const preview = useMemo(() => {
    try {
      return draftDocument(draft);
    } catch {
      return draftDocument({ ...draft, videoUrl: "" });
    }
  }, [draft]);

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  const update =
    (field: keyof ComposerState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value;
      if (field === "slug") setSlugEdited(true);
      setDraft((current) => {
        const next = { ...current, [field]: value, status: current.status === "submitted" ? "draft" : current.status };
        if (field === "title" && !slugEdited && !current.featureId) next.slug = slugify(value);
        return next;
      });
    };
  const loadDraft = (item: EditorialWorkItem) => {
    setDraft(composerFromWorkItem(item));
    setSlugEdited(true);
  };

  const draftRows: PanelDirectoryRow[] = result.drafts.map((item) => {
    const rowStatus = actionFeatureId === item.feature_id && response && "status" in response && typeof response.status === "string" ? response.status : item.lifecycle_status;
    const rowLabel = actionFeatureId === item.feature_id && response && "success" in response && rowStatus === "draft" ? "Draft saved" : myPanelsStatusLabel(rowStatus);
    return {
    id: item.feature_id,
    title: item.title ?? "Untitled draft",
    type: "Editorial Feature",
    status: rowLabel,
    date: new Date(item.updated_at).toLocaleDateString("en-GB"),
    meta: item.reviewer_note ? `Reviewer note: ${item.reviewer_note}` : item.slug,
    action: rowStatus === "submitted" || rowStatus === "publish_ready" || rowStatus === "approved" ? (
      <span>{rowStatus === "publish_ready" || rowStatus === "approved" ? "PUBLISH-READY" : "SUBMITTED"}</span>
    ) : (
      <div className="panel-directory-actions">
        <button className="op-button" type="button" onClick={() => loadDraft(item)}>
          {item.lifecycle_status === "changes_requested" ? "REVISE" : "CONTINUE"}
        </button>
        <Form method="post" action="/editorial">
          <input type="hidden" name="intent" value="submit-existing" />
          <input type="hidden" name="featureId" value={item.feature_id} />
          <button className="op-button action-primary" type="submit" onClick={() => setSubmitIntent("submit")} disabled={pending}>{pending && submitIntent === "submit" ? "SUBMITTING…" : item.lifecycle_status === "changes_requested" ? "RESUBMIT FOR REVIEW" : "SUBMIT FOR REVIEW"}</button>
        </Form>
      </div>
    ),
  };
  });
  const reviewRows: PanelDirectoryRow[] = result.review.map((item: any) => ({
    id: item.feature_id,
    title: item.title ?? "Untitled submitted panel",
    type: "Editorial Feature",
    status: reviewInboxStatusLabel(item.lifecycle_status),
    date: new Date(item.updated_at).toLocaleDateString("en-GB"),
    meta: item.summary,
    action: <Link to="/moderation">REVIEW →</Link>,
  }));
  return (
    <div className="op-workspace profile-page">
      <nav className="profile-actions" aria-label="Editorial actions">
        <Link to="/profile">← RETURN TO PROFILE</Link>
        <Link to="/">VIEW PUBLICATION</Link>
        {result.capabilities.moderation && <Link to="/moderation">MODERATION</Link>}
      </nav>
      <p className="editorial-marker">EDITORIAL DASHBOARD</p>
      <h1>Feature composer</h1>
      <section className="composer-status" aria-label="Composer status">
        <p className="editorial-marker">PANEL STATE</p>
        <strong><span className="panel-status">{durableStatus}</span></strong>
        {selected ? <p>Editing {selected.title}</p> : <p>New panels begin as private drafts.</p>}
        {selected?.reviewer_note ? <p className="reviewer-note"><strong>Reviewer note:</strong> {selected.reviewer_note}</p> : null}
        {isChangesRequested ? <p>Make your changes, then resubmit so editors can review the new version.</p> : null}
      </section>
      {response && "success" in response && (
        <p className="profile-contribution" role="status">
          {response.success}
        </p>
      )}
      {response && "error" in response && (
        <p className="profile-contribution" role="alert">
          {response.error}
        </p>
      )}
      {response && "success" in response && "featureId" in response && (
        <article className="profile-contribution" aria-label="Latest saved draft">
          <p>{durableStatus} · Just now</p>
          <strong>{draft.title}</strong>
          <p>{draft.slug}</p>
        </article>
      )}
      <Form method="post" action="/editorial" className="op-form">
        <input type="hidden" name="featureId" value={draft.featureId ?? ""} />
        <input type="hidden" name="currentStatus" value={selectedStatus} />
        <label>
          Title
          <input name="title" required minLength={4} maxLength={150} value={draft.title} onChange={update("title")} />
        </label>
        <label>
          Slug
          <span className="field-help">The short URL name for this panel. Use lowercase letters, numbers and hyphens.</span>
          <input name="slug" required pattern="[a-z0-9-]{3,80}" value={draft.slug} onChange={update("slug")} aria-describedby="slug-help slug-error" />
          <span id="slug-help" className="field-help">Example: sucker-punch-doing-what-ubisoft-cant</span>
        </label>
        {slugError ? <p id="slug-error" className="field-error" role="alert">Use lowercase letters, numbers and hyphens only. Do not use spaces or punctuation.</p> : null}
        <label>
          Standfirst / summary
          <textarea name="summary" required minLength={8} maxLength={1000} value={draft.summary} onChange={update("summary")} />
        </label>
        <label>
          Category
          <select name="categoryId" value={draft.categoryId ?? ""} onChange={update("categoryId")}>
            <option value="">Use default category</option>
            {result.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Image URL or existing asset path
          <span className="field-help">Optional. Add an image URL or uploaded image path for the feature card and article preview.</span>
          <input name="image" placeholder="/assets/koma-vhs-v2.svg" value={draft.image ?? ""} onChange={update("image")} />
        </label>
        <label>
          Image alt text
          <span className="field-help">Required when you add an image. Describe the image for readers using assistive technology.</span>
          <input name="imageAlt" maxLength={400} value={draft.imageAlt ?? ""} onChange={update("imageAlt")} aria-describedby="image-alt-help" />
        </label>
        {imageAltError ? <p id="image-alt-help" className="field-error" role="alert">Image alt text is required when an image is provided.</p> : <p id="image-alt-help" className="field-help">Placeholder fallback uses default alt text: KOMA://PLAY editorial placeholder.</p>}
        <label>
          Body sections
          <span className="field-help">Use section headings like ## Opening read, followed by paragraphs for the article body.</span>
          <textarea name="sections" required minLength={20} rows={10} value={draft.sections} onChange={update("sections")} />
        </label>
        <label>
          YouTube/Twitch video URL
          <input name="videoUrl" type="url" value={draft.videoUrl ?? ""} onChange={update("videoUrl")} />
        </label>
        <div className="composer-action-help">
          <p>Save keeps this private in MY PANELS.</p>
          <p>Submit sends it to the shared Review Inbox for editors and moderators.</p>
          <p>Drafts are private until submitted.</p>
        </div>
        <div className="profile-actions">
          <button className="op-button" name="intent" value="save" onClick={() => setSubmitIntent("save")} disabled={pending || isPublishReady}>
            {pending && submitIntent === "save" ? "SAVING…" : isChangesRequested ? "SAVE REVISION" : "SAVE DRAFT"}
          </button>
          <button className="op-button action-primary" name="intent" value="submit" onClick={() => setSubmitIntent("submit")} disabled={pending || isSubmitted || isPublishReady}>
            {pending && submitIntent === "submit" ? "SUBMITTING…" : isSubmitted ? "SUBMITTED" : isPublishReady ? "PUBLISH-READY" : isChangesRequested ? "RESUBMIT FOR REVIEW" : "SUBMIT FOR REVIEW"}
          </button>
        </div>
      </Form>
      <section className="editorial-preview-shell" aria-label="Live editorial preview">
        <p className="editorial-marker">LIVE PREVIEW</p>
        {hasComposerContent ? <ArticleRenderer document={preview} /> : <p className="preview-empty">Start typing to build the panel preview.</p>}
      </section>
      <section>
        <h2>MY PANELS</h2>
        <PanelDirectory label="Editorial panels" rows={draftRows} empty="No saved panels yet." />
      </section>
      {result.capabilities.editorial && (
        <section>
          <h2>Review inbox</h2>
          <PanelDirectory label="Editorial review inbox" rows={reviewRows} empty="No submitted drafts waiting." />
        </section>
      )}
    </div>
  );
}

export default function Editorial() {
  const result = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const selectedFeatureId = searchParams.get("feature") ?? "";
  return (
    <main className="editorial-page">
      <Masthead />
      {result.state !== "accepted" ? <Boundary state={result.state} /> : <FeatureComposer result={result as AcceptedLoaderData} selectedFeatureId={selectedFeatureId} />}
    </main>
  );
}
