import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/editorial";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { Masthead } from "../components/Masthead";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { draftDocument, draftSchema, documentBodyText } from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";

const emptyPreview = draftDocument({
  title: "Tokon draft feature",
  slug: "tokon-draft",
  summary: "A working editorial summary for preview.",
  sections: "## Opening read\n\nThis is how the shared article renderer will treat a submitted draft.",
  status: "draft",
  image: "",
  imageAlt: "",
  videoUrl: "",
  featureId: "",
  categoryId: "",
});

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
    resolved.client.from("editorial_documents").select("feature_id,lifecycle_status,updated_at,working_document,features(title,slug,summary)").order("updated_at", { ascending: false }),
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
      status: intent === "submit" ? "submitted" : "draft",
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

export default function Editorial() {
  const result = useLoaderData<typeof loader>();
  const actionResult = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <main className="editorial-page">
      <Masthead />
      {result.state !== "accepted" ? (
        <Boundary state={result.state} />
      ) : (
        <div className="op-workspace profile-page">
          <nav className="profile-actions" aria-label="Editorial actions">
            <Link to="/profile">← RETURN TO PROFILE</Link>
            <Link to="/">VIEW PUBLICATION</Link>
            {result.capabilities.moderation && <Link to="/moderation">MODERATION</Link>}
          </nav>
          <p className="editorial-marker">EDITORIAL DASHBOARD</p>
          <h1>Feature composer</h1>
          {actionResult && "success" in actionResult && <p className="profile-contribution" role="status">{actionResult.success}{"status" in actionResult && actionResult.status === "submitted" ? " Status: Submitted for review." : ""}</p>}
          {actionResult && "error" in actionResult && <p className="profile-contribution" role="alert">{actionResult.error}</p>}
          <Form method="post" className="op-form">
            <input type="hidden" name="featureId" value={(actionResult && "featureId" in actionResult && typeof actionResult.featureId === "string" ? actionResult.featureId : "")} />
            <label>Title<input name="title" required minLength={4} maxLength={150} defaultValue="Tokon draft feature" /></label>
            <label>Slug<input name="slug" required pattern="[a-z0-9-]{3,80}" defaultValue="tokon-draft" /></label>
            <label>Standfirst / summary<textarea name="summary" required minLength={8} maxLength={1000} defaultValue="A concise summary for the feature strip and article header." /></label>
            <label>Category<select name="categoryId"><option value="">Use default category</option>{result.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label>Image URL or existing asset path<input name="image" placeholder="/assets/koma-vhs-v2.svg" /></label>
            <label>Image alt text<input name="imageAlt" maxLength={400} /></label>
            <label>Body sections<textarea name="sections" required minLength={20} rows={10} defaultValue={"## Opening read\n\nWrite the first section here. Use blank lines between paragraphs.\n\n## Second section\n\nAdd another paragraph for the draft."} /></label>
            <label>YouTube/Twitch video URL<input name="videoUrl" type="url" /></label>
            <div className="profile-actions"><button className="op-button" name="intent" value="save" disabled={navigation.state !== "idle"}>SAVE DRAFT</button><button className="op-button action-primary" name="intent" value="submit" disabled={navigation.state !== "idle"}>SUBMIT FOR REVIEW</button></div>
          </Form>
          <section><h2>Preview</h2><ArticleRenderer document={emptyPreview} /></section>
          <section><h2>My drafts</h2>{result.drafts.length ? result.drafts.map((draft: any) => <article key={draft.feature_id} className="profile-contribution"><p>{draft.lifecycle_status === "submitted" ? "Submitted for review" : draft.lifecycle_status} · {new Date(draft.updated_at).toLocaleDateString("en-GB")}</p><strong>{((Array.isArray((draft as any).features) ? (draft as any).features[0] : (draft as any).features)?.title) ?? "Untitled draft"}</strong></article>) : <p>No saved drafts yet.</p>}</section>
          <section><h2>Review inbox</h2>{result.review.length ? result.review.map((draft: any) => <article key={draft.feature_id} className="profile-contribution"><p>{draft.lifecycle_status === "submitted" ? "Submitted for review" : draft.lifecycle_status} · {new Date(draft.updated_at).toLocaleDateString("en-GB")}</p><h3>{draft.title}</h3><p>{draft.summary}</p><ArticleRenderer document={draft.working_document as any} /><Form method="post" action="/moderation"><input type="hidden" name="featureId" value={draft.feature_id} /><button className="op-button action-primary" name="intent" value="approveDraft">APPROVE</button><button className="op-button" name="intent" value="changesDraft">REQUEST CHANGES</button></Form></article>) : <p>No submitted drafts waiting.</p>}</section>
        </div>
      )}
    </main>
  );
}
