import { useEffect, useMemo, useState } from "react";
import { data, Form, Link, useActionData, useFetcher, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/editorial";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { Masthead } from "../components/Masthead";
import { PanelDirectory, type PanelDirectoryRow } from "../components/PanelDirectory";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { composerFromWorkItem, draftDocument, draftSchema, documentBodyText, editorialStatusLabel, type EditorialWorkItem } from "../lib/editorial-alpha";
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
      return data({ success: "Submitted for review.", featureId: saved.data, status: "submitted" }, { headers: resolved.headers });
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
    return data({ success: intent === "submit" ? "Submitted for review." : "Draft saved.", featureId: saved.data, status: value.status }, { headers: resolved.headers });
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
  title: "Tokon draft feature",
  slug: "tokon-draft",
  summary: "A concise summary for the feature strip and article header.",
  categoryId: "",
  image: "",
  imageAlt: "",
  sections: "## Opening read\n\nWrite the first section here. Use blank lines between paragraphs.\n\n## Second section\n\nAdd another paragraph for the draft.",
  videoUrl: "",
  status: "draft",
};

function FeatureComposer({ result, selectedFeatureId }: { result: AcceptedLoaderData; selectedFeatureId: string }) {
  const fetcher = useFetcher<typeof action>();
  const routeActionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<ComposerState>(() => {
    const selected = result.drafts.find((item) => item.feature_id === selectedFeatureId);
    return selected ? composerFromWorkItem(selected) : initialComposer;
  });
  const [submitIntent, setSubmitIntent] = useState<"save" | "submit">("save");
  const pending = fetcher.state !== "idle" || navigation.state !== "idle";
  const response = fetcher.data ?? routeActionData;
  const actionFeatureId = response && "featureId" in response && typeof response.featureId === "string" ? response.featureId : "";
  const selected = result.drafts.find((item) => item.feature_id === draft.featureId);
  const selectedStatus = response && "status" in response && typeof response.status === "string" ? response.status : selected?.lifecycle_status ?? draft.status;
  const durableStatus = response && "success" in response && response.status === "draft" ? "Draft saved" : editorialStatusLabel(selectedStatus);
  const isSubmitted = selectedStatus === "submitted";
  const isPublishReady = selectedStatus === "publish_ready" || selectedStatus === "approved";
  const isChangesRequested = selectedStatus === "changes_requested";

  useEffect(() => {
    const selectedWork = result.drafts.find((item) => item.feature_id === selectedFeatureId);
    if (selectedWork) setDraft(composerFromWorkItem(selectedWork));
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

  const update =
    (field: keyof ComposerState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setDraft((current) => ({ ...current, [field]: event.target.value, status: current.status === "submitted" ? "draft" : current.status }));
    };
  const loadDraft = (item: EditorialWorkItem) => {
    setDraft(composerFromWorkItem(item));
  };

  const draftRows: PanelDirectoryRow[] = result.drafts.map((item) => {
    const rowStatus = actionFeatureId === item.feature_id && response && "status" in response && typeof response.status === "string" ? response.status : item.lifecycle_status;
    const rowLabel = actionFeatureId === item.feature_id && response && "success" in response && rowStatus === "draft" ? "Draft saved" : editorialStatusLabel(rowStatus);
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
    status: editorialStatusLabel(item.lifecycle_status),
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
      {(selected || response) && <p className="profile-contribution">Status: <span className="panel-status">{durableStatus}</span>{selected ? ` · Editing ${selected.title}` : ""}{selected?.reviewer_note ? ` · Reviewer note: ${selected.reviewer_note}` : ""}</p>}
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
      <fetcher.Form method="post" className="op-form">
        <input type="hidden" name="featureId" value={draft.featureId ?? ""} />
        <input type="hidden" name="currentStatus" value={selectedStatus} />
        <label>
          Title
          <input name="title" required minLength={4} maxLength={150} value={draft.title} onChange={update("title")} />
        </label>
        <label>
          Slug
          <input name="slug" required pattern="[a-z0-9-]{3,80}" value={draft.slug} onChange={update("slug")} />
        </label>
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
          <input name="image" placeholder="/assets/koma-vhs-v2.svg" value={draft.image ?? ""} onChange={update("image")} />
        </label>
        <label>
          Image alt text
          <input name="imageAlt" maxLength={400} value={draft.imageAlt ?? ""} onChange={update("imageAlt")} />
        </label>
        <label>
          Body sections
          <textarea name="sections" required minLength={20} rows={10} value={draft.sections} onChange={update("sections")} />
        </label>
        <label>
          YouTube/Twitch video URL
          <input name="videoUrl" type="url" value={draft.videoUrl ?? ""} onChange={update("videoUrl")} />
        </label>
        <div className="profile-actions">
          <button className="op-button" name="intent" value="save" onClick={() => setSubmitIntent("save")} disabled={pending || isPublishReady}>
            {pending && submitIntent === "save" ? "SAVING…" : isChangesRequested ? "SAVE REVISION" : "SAVE DRAFT"}
          </button>
          <button className="op-button action-primary" name="intent" value="submit" onClick={() => setSubmitIntent("submit")} disabled={pending || isSubmitted || isPublishReady}>
            {pending && submitIntent === "submit" ? "SUBMITTING…" : isSubmitted ? "SUBMITTED" : isPublishReady ? "PUBLISH-READY" : isChangesRequested ? "RESUBMIT FOR REVIEW" : "SUBMIT FOR REVIEW"}
          </button>
        </div>
      </fetcher.Form>
      <section>
        <h2>Preview</h2>
        <ArticleRenderer document={preview} />
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
