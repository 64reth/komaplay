import { prepareEditorialImage } from "../lib/prepare-image";
import { LatestUploadCoordinator } from "../lib/latest-upload";
import {
  turnstileSiteKey,
  verifyEditorialChallenge,
} from "../lib/turnstile.server";
import { SubmissionChallenge } from "../components/SubmissionChallenge";
import { actionFailure } from "../lib/action-feedback";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  data,
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useBlocker,
} from "react-router";
import { z } from "zod";
import type { Route } from "./+types/editorial";
import { ArticleRenderer } from "../components/ArticleRenderer";
import { Masthead } from "../components/Masthead";
import {
  PanelDirectory,
  type PanelDirectoryRow,
} from "../components/PanelDirectory";
import { ArticleSectionBuilder } from "../components/ArticleSectionBuilder";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import {
  parseComposerSections,
  serializeComposerSections,
  composerSectionsToText,
  updateComposerSection,
  type ComposerSection,
  composerFromWorkItem,
  draftDocument,
  draftSchema,
  documentBodyText,
  editorialStatusLabel,
  myPanelsStatusLabel,
  reviewInboxStatusLabel,
  type EditorialWorkItem,
} from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";
import { FieldErrors, RequirementList } from "../components/EditorialErrors";
import { composerDraftSchema } from "../lib/editorial-alpha";
import {
  validateEditorialSubmission,
  orderIssues,
  issueTarget,
  fieldAttributes,
  requirementsMessage,
  submissionCopy,
  type DocumentIssue,
} from "../lib/editorial-validation";

async function editorialContext(request: Request, review = false) {
  const resolved = await resolveAuth(request);
  if (
    resolved.auth.state !== "authenticated" ||
    !resolved.client ||
    !resolved.user
  ) {
    return {
      resolved,
      state: "signed-out" as const,
      capabilities: { editorial: false, moderation: false },
    };
  }
  if (resolved.auth.member.accountStatus !== "active") {
    return {
      resolved,
      state: resolved.auth.member.accountStatus as "restricted" | "suspended",
      capabilities: { editorial: false, moderation: false },
    };
  }
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted") {
    return {
      resolved,
      state: "verifying" as const,
      capabilities: { editorial: false, moderation: false },
    };
  }
  const capabilities = await memberCapabilities(
    resolved.client,
    resolved.auth.member,
  );
  const rpc = await resolved.client.rpc("editorial_has_access", {
    target: resolved.user.id,
    review,
  });
  const allowed = !rpc.error && rpc.data === true;
  return {
    resolved,
    state:
      allowed || capabilities.editorial
        ? ("accepted" as const)
        : ("denied" as const),
    capabilities,
  };
}

export async function loader({ request }: Route.LoaderArgs) {
  const context = await editorialContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client) {
    return data(
      {
        state: context.state,
        capabilities: context.capabilities,
        categories: [],
        drafts: [],
        review: [],
      },
      { headers: resolved.headers },
    );
  }
  const [categories, drafts, review] = await Promise.all([
    resolved.client.from("categories").select("id,name,slug").order("name"),
    resolved.client.rpc("editorial_my_work"),
    resolved.client.rpc("editorial_review_inbox"),
  ]);
  if (categories.error || drafts.error || review.error) throw data("Editorial work could not be loaded. Please try again shortly.",{status:503,headers:resolved.headers});
  return data(
    {
      state: "accepted" as const,
      turnstileSiteKey: turnstileSiteKey(),
      creationKey: crypto.randomUUID(),
      capabilities: context.capabilities,
      categories: categories.data ?? [],
      drafts: drafts.error ? [] : (drafts.data ?? []),
      review: review.error ? [] : (review.data ?? []),
    },
    { headers: resolved.headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  const context = await editorialContext(request);
  const { resolved } = context;
  if (context.state !== "accepted" || !resolved.client)
    return data(
      { error: "Editorial access is required." },
      { status: 403, headers: resolved.headers },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return data(
      { error: "Same-origin request required." },
      { status: 403, headers: resolved.headers },
    );
  let submitting = false;
  let safelySaved = false;
  let savedFeatureId = "";
  let savedStatus = "draft";
  let savedVersion: string | undefined;
  try {
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "save");
    submitting = ["submit", "submit-existing", "submitExisting"].includes(
      intent,
    );
    const savedOnly =
      intent === "submit-existing" ||
      intent === "submitExisting" ||
      (intent === "submit" && !form.has("title"));
    if (savedOnly) {
      const featureId = String(form.get("featureId") ?? "");
      const work = await resolved.client.rpc("editorial_my_work");
      if (work.error) throw new Error("work-load");
      const item = (work.data as EditorialWorkItem[]).find(
        (item) => item.feature_id === featureId,
      );
      if (!item) throw new Error("missing-draft");
      safelySaved = true;
      savedFeatureId = featureId;
      savedStatus = item.lifecycle_status;
      const existing = composerDraftSchema.parse(composerFromWorkItem(item));
      const categories = await resolved.client.from("categories").select("id");
      if (categories.error) throw new Error("categories");
      const issues = validateEditorialSubmission(
        existing,
        parseComposerSections(existing.sectionsJson, existing.sections),
        (categories.data ?? []).map((category) => category.id),
      );
      if (
        !issues.some((issue) => issue.field === "slug") &&
        existing.slug.trim() !== item.slug
      ) {
        issues.unshift({
          key: "panel:slug:unavailable",
          sectionId: null,
          field: "slug",
          code: "unavailable",
          value: existing.slug,
          message:
            "That panel address is already in use. Choose a different address before submitting.",
        });
      }
      if (issues.length)
        return data(
          {
            error: submissionCopy.blocked,
            issues,
            featureId,
            status: item.lifecycle_status,
          },
          { status: 400, headers: resolved.headers },
        );
      if (
        !(await verifyEditorialChallenge(
          form.get("cf-turnstile-response"),
          request,
        ))
      )
        return data(
          {
            error:
              "Your draft is saved. Complete the submission check in the editor, then try again.",
            featureId,
            status: item.lifecycle_status,
          },
          { status: 403, headers: resolved.headers },
        );
      const result = await resolved.client.rpc("submit_editorial_draft", {
        target: featureId,
      });
      if (result.error) throw result.error;
      return data(
        {
          success: submissionCopy.submitted,
          featureId: result.data,
          status: "submitted",
        },
        { headers: resolved.headers },
      );
    }
    const value = composerDraftSchema.parse({
      ...Object.fromEntries(
        [
          "featureId",
          "title",
          "slug",
          "summary",
          "categoryId",
          "image",
          "imageAlt",
          "sections",
          "sectionsJson",
          "videoUrl",
        ].map((key) => [key, form.get(key) ?? ""]),
      ),
      format: form.get("format") ?? "essay",
      status:
        String(form.get("currentStatus") ?? "") === "changes_requested"
          ? "changes_requested"
          : "draft",
    });
    const sections = parseComposerSections(
      value.sectionsJson,
      value.sections,
      value.videoUrl,
    );
    if (sections.some((section) => section.type === "legacy")) {
      const work = await resolved.client.rpc("editorial_my_work");
      if (work.error) throw new Error("work-load");
      const original = (work.data as EditorialWorkItem[]).find(
        (item) => item.feature_id === value.featureId,
      );
      for (const section of sections.filter(
        (section) => section.type === "legacy",
      )) {
        const module = original?.working_document.modules.find(
          (module) => module.id === section.id,
        );
        if (!module) throw new Error("missing-section");
        section.module = module;
      }
    }
    value.sectionsJson = serializeComposerSections(sections);
    const issues = validateEditorialSubmission(value, sections);
    const composer = { ...value, featureId: undefined, status: undefined };
    const document = { ...draftDocument(value), composer };
    // Keep unfinished contributor input in the existing JSON document. Canonical
    // metadata needs safe values for database constraints while the draft is private.
    const payload = {
      feature_id: value.featureId || "",
      title: value.title.trim().slice(0, 150) || "Untitled draft",
      slug: /^[a-z0-9-]{3,80}$/.test(value.slug.trim())
        ? value.slug.trim()
        : `draft-${value.featureId || crypto.randomUUID()}`,
      summary: value.summary,
      category_id: z.string().uuid().safeParse(value.categoryId).success
        ? value.categoryId
        : "",
      image: value.image,
      image_alt: value.imageAlt,
      body: documentBodyText(value.sections, value.sectionsJson),
      status: value.status,
      document,
      expected_updated_at: String(form.get("expectedUpdatedAt") ?? ""),
      request_key: String(form.get("creationKey") ?? ""),
    };
    let saved = await resolved.client.rpc("save_editorial_draft_versioned", { payload });
    if (
      saved.error?.code === "23505" &&
      saved.error.message.includes("features_slug_key")
    ) {
      issues.push({
        key: "panel:slug:unavailable",
        sectionId: null,
        field: "slug",
        code: "unavailable",
        value: value.slug,
        message:
          "That panel address is already in use. Choose a different address before submitting.",
      });
      saved = await resolved.client.rpc("save_editorial_draft_versioned", {
        payload: {
          ...payload,
          slug: `draft-${value.featureId || crypto.randomUUID()}`,
        },
      });
    }
    if (saved.error) throw saved.error;
    const receipt = saved.data as { feature_id: string; updated_at: string };
    savedVersion = receipt.updated_at;
    saved.data = receipt.feature_id;
    safelySaved = true;
    savedFeatureId = String(saved.data);
    savedStatus = value.status;
    if (!submitting)
      return data(
        {
          success: submissionCopy.saved,
          featureId: saved.data,
          savedVersion,
          status: value.status,
        },
        { headers: resolved.headers },
      );
    const categories = await resolved.client.from("categories").select("id");
    if (categories.error) throw new Error("categories");
    const contextualIssues = validateEditorialSubmission(
      value,
      sections,
      (categories.data ?? []).map((category) => category.id),
    );
    for (const issue of contextualIssues)
      if (!issues.some((existing) => existing.key === issue.key))
        issues.push(issue);
    orderIssues(issues, sections);
    if (issues.length)
      return data(
        {
          error: submissionCopy.blocked,
          issues,
          featureId: saved.data,
          savedVersion,
          status: value.status,
        },
        { status: 400, headers: resolved.headers },
      );
    if (
      !(await verifyEditorialChallenge(
        form.get("cf-turnstile-response"),
        request,
      ))
    )
      return data(
        {
          error:
            "Your draft is saved, but hasn’t been submitted. Complete the quick check, then try again.",
          featureId: saved.data,
          savedVersion,
          status: value.status,
        },
        { status: 403, headers: resolved.headers },
      );
    const submitted = await resolved.client.rpc("submit_editorial_draft", {
      target: saved.data,
    });
    if (submitted.error) throw submitted.error;
    return data(
      {
        success: submissionCopy.submitted,
        featureId: saved.data,
        savedVersion,
        status: "submitted",
      },
      { headers: resolved.headers },
    );
  } catch (error) {
    return data(
      {
        error: actionFailure(
          error,
          submitting && safelySaved
            ? submissionCopy.submitFailure
            : submissionCopy.saveFailure,
        ),
        ...(savedFeatureId
          ? { featureId: savedFeatureId, status: savedStatus, savedVersion }
          : {}),
      },
      { status: 400, headers: resolved.headers },
    );
  }
}

function Boundary({ state }: { state: string }) {
  if (state === "signed-out")
    return (
      <SignedOutMemberBoundary
        title="SIGN IN TO USE EDITORIAL"
        returnTo="/editorial"
      />
    );
  return (
    <section className="op-workspace">
      <p className="editorial-marker">EDITORIAL ACCESS</p>
      <h1>Editorial dashboard unavailable</h1>
      <p role="alert">
        Active membership and editorial permission are required.
      </p>
      <Link to="/profile">← RETURN TO PROFILE</Link>
    </section>
  );
}

type ComposerState = z.infer<typeof draftSchema>;

type AcceptedLoaderData = {
  turnstileSiteKey?: string | null;
  creationKey?: string;
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
  sectionsJson: "[]",
  videoUrl: "",
  status: "draft",
  format: "essay",
};

function FeatureComposer({
  result,
  selectedFeatureId,
}: {
  result: AcceptedLoaderData;
  selectedFeatureId: string;
}) {
  const routeActionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [draft, setDraft] = useState<ComposerState>(() => {
    const selected = result.drafts.find(
      (item) => item.feature_id === selectedFeatureId,
    );
    return selected ? composerFromWorkItem(selected) : initialComposer;
  });
  const [creationKey] = useState(result.creationKey ?? "");
  const contentSignature = (value: ComposerState) => JSON.stringify({...value,featureId:"",status:"draft"});
  const [savedSignature,setSavedSignature] = useState(()=>contentSignature(draft));
  const sentSignature=useRef(savedSignature);
  const dirty=contentSignature(draft)!==savedSignature;
  const blocker=useBlocker(({currentLocation,nextLocation})=>dirty && currentLocation.pathname+currentLocation.search!==nextLocation.pathname+nextLocation.search);
  useEffect(()=>{ if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(
    result.drafts.find((item) => item.feature_id === selectedFeatureId)
      ?.updated_at ?? "",
  );
  const [submitIntent, setSubmitIntent] = useState<"save" | "submit">("save");
  const sections = useMemo(
    () =>
      parseComposerSections(draft.sectionsJson, draft.sections, draft.videoUrl),
    [draft.sectionsJson, draft.sections, draft.videoUrl],
  );
  const changeSections = (sections: ComposerSection[]) =>
    setDraft((current) => ({
      ...current,
      sectionsJson: serializeComposerSections(sections),
      sections: composerSectionsToText(sections),
      status: current.status === "submitted" ? "draft" : current.status,
    }));
  const [slugEdited, setSlugEdited] = useState(Boolean(selectedFeatureId));
  const uploadCoordinator=useRef(new LatestUploadCoordinator());
  const [imageUploads,setImageUploads]=useState<Record<string,{status:"uploading"|"replacing"|"uploaded"|"failed";message:string}>>({});
  useEffect(()=>()=>uploadCoordinator.current.cancelAll(),[]);
  const uploadPending=Object.values(imageUploads).some(item=>item.status==="uploading"||item.status==="replacing");
  const clearUpload=(key:string)=>{uploadCoordinator.current.cancel(key);setImageUploads(current=>{const next={...current};delete next[key];return next;});};
  const pending = navigation.state !== "idle";
  const response = routeActionData;
  const errorSummary = useRef<HTMLDivElement>(null);
  const submissionIssues = validateEditorialSubmission(
    draft,
    sections,
    result.categories.map((category) => category.id),
  );
  if (response && "issues" in response)
    for (const issue of response.issues as DocumentIssue[]) {
      if (
        issue.code === "unavailable" &&
        issue.field === "slug" &&
        issue.value === draft.slug &&
        !submissionIssues.some((item) => item.key === issue.key)
      )
        submissionIssues.push(issue);
    }
  orderIssues(submissionIssues, sections);
  const attrs = (field: string) =>
    fieldAttributes(submissionIssues, null, field);
  const errors = (field: string) => (
    <FieldErrors issues={submissionIssues} field={field} />
  );
  useEffect(() => {
    if (response && "error" in response) {
      if ("featureId" in response && response.featureId !== draft.featureId)
        return;
      const first = "issues" in response ? submissionIssues[0] : undefined;
      const target =
        (first ? document.getElementById(issueTarget(first)) : null) ??
        errorSummary.current;
      target?.focus();
      target?.scrollIntoView({ block: "center" });
    }
  }, [response, draft.featureId]);
  const actionFeatureId =
    response &&
    "featureId" in response &&
    typeof response.featureId === "string"
      ? response.featureId
      : "";
  const selected = result.drafts.find(
    (item) => item.feature_id === draft.featureId,
  );
  const selectedStatus =
    response && "status" in response && typeof response.status === "string"
      ? response.status
      : (selected?.lifecycle_status ?? draft.status);
  const durableStatus =
    selectedStatus === "submitted"
      ? "Submitted"
      : editorialStatusLabel(selectedStatus);
  const isSubmitted = selectedStatus === "submitted";
  const isPublishReady =
    selectedStatus === "publish_ready" || selectedStatus === "approved";
  const isChangesRequested = selectedStatus === "changes_requested";
  const hasComposerContent = Boolean(
    draft.title.trim() || draft.summary.trim() || draft.sections.trim(),
  );

  useEffect(() => {
    const selectedWork = result.drafts.find(
      (item) => item.feature_id === selectedFeatureId,
    );
    if (selectedWork) {
      setSavedSignature(contentSignature(composerFromWorkItem(selectedWork)));
      setExpectedUpdatedAt(selectedWork.updated_at);
      setDraft(composerFromWorkItem(selectedWork));
      setSlugEdited(true);
    }
  }, [selectedFeatureId]);

  useEffect(() => {
    if (
      response &&
      "featureId" in response &&
      typeof response.featureId === "string"
    ) {
      if ("savedVersion" in response && typeof response.savedVersion === "string")
        setSavedSignature(sentSignature.current);
      const savedWork = result.drafts.find(
        (item) => item.feature_id === response.featureId,
      );
      // Only adopt the version from our own atomic save, never a later loader
      // snapshot that may contain another editor’s changes. Conflicts have no receipt.
      if ("savedVersion" in response && typeof response.savedVersion === "string")
        setExpectedUpdatedAt(response.savedVersion);
      setDraft((current) => ({
        ...("error" in response &&
        current.featureId !== response.featureId &&
        savedWork
          ? composerFromWorkItem(savedWork)
          : current),
        featureId: response.featureId,
        status:
          typeof response.status === "string"
            ? (response.status as any)
            : current.status,
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
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const value = event.target.value;
      if (field === "slug") setSlugEdited(true);
      setDraft((current) => {
        const next = {
          ...current,
          [field]: value,
          status: current.status === "submitted" ? "draft" : current.status,
        };
        if (field === "title" && !slugEdited && !current.featureId)
          next.slug = slugify(value);
        return next;
      });
    };
  const loadDraft = (item: EditorialWorkItem) => {
    if(dirty && !window.confirm("You have unsaved changes. Open this saved panel and discard those changes?")) return;
    setSavedSignature(contentSignature(composerFromWorkItem(item)));
    setExpectedUpdatedAt(item.updated_at);
    setDraft(composerFromWorkItem(item));
    setSlugEdited(true);
  };
  async function uploadFeatureImage(
    event: ChangeEvent<HTMLInputElement>,
    sectionId?: string,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    const key=sectionId??"hero";
    clearUpload(key);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setImageUploads(current=>({...current,[key]:{status:"failed",message:"Use PNG, JPEG or WebP."}}));
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploads(current=>({...current,[key]:{status:"failed",message:"Images must be 5 MB or smaller."}}));
      event.target.value = "";
      return;
    }
    if (!draft.slug.trim()) {
      setImageUploads(current=>({...current,[key]:{status:"failed",message:"Add a panel address before uploading an image."}}));
      event.target.value = "";
      return;
    }
    const replacing=sectionId?Boolean(sections.find(item=>item.id===sectionId)?.url):Boolean(draft.image);
    const ticket=uploadCoordinator.current.begin(key);
    setImageUploads(current=>({...current,[key]:{status:replacing?"replacing":"uploading",message:replacing?"Replacing image…":"Uploading image…"}}));
    try {
      const body = new FormData();
      body.set("file", await prepareEditorialImage(file));
      if(!ticket.current())return;
      body.set("slug", draft.slug);
      const response = await fetch("/member/editorial/upload", {
        method: "POST",
        body,
        signal:ticket.signal,
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url)
        throw new Error(payload.error ?? "The image could not be uploaded.");
      if(!ticket.current())return;
      setDraft((current) => {
        if (sectionId) {
          const next = updateComposerSection(
            parseComposerSections(current.sectionsJson, current.sections),
            sectionId,
            { url: payload.url },
          );
          return {
            ...current,
            sectionsJson: serializeComposerSections(next),
            sections: composerSectionsToText(next),
          };
        }
        return {
          ...current,
          image: payload.url ?? current.image,
          status: current.status === "submitted" ? "draft" : current.status,
        };
      });
      setImageUploads(current=>({...current,[key]:{status:"uploaded",message:replacing?"This image was replaced. Save again to keep the latest version.":"Uploaded. Ready to save."}}));
    } catch(error) {
      if(!ticket.current()||(error instanceof DOMException&&error.name==="AbortError"))return;
      setImageUploads(current=>({...current,[key]:{status:"failed",message:"The image upload failed. Try again or remove it."}}));
    } finally {
      ticket.finish();
      event.target.value = "";
    }
  }

  const draftRows: PanelDirectoryRow[] = result.drafts.map((item) => {
    const rowStatus =
      actionFeatureId === item.feature_id &&
      response &&
      "status" in response &&
      typeof response.status === "string"
        ? response.status
        : item.lifecycle_status;
    const rowLabel =
      actionFeatureId === item.feature_id &&
      response &&
      "success" in response &&
      rowStatus === "draft"
        ? "Draft saved"
        : myPanelsStatusLabel(rowStatus);
    return {
      id: item.feature_id,
      title: item.title ?? "Untitled draft",
      type: "Editorial Feature",
      status: rowLabel,
      date: new Date(item.updated_at).toLocaleDateString("en-GB"),
      meta: item.reviewer_note
        ? `Reviewer note: ${item.reviewer_note}`
        : item.slug,
      action:
        rowStatus === "submitted" ||
        rowStatus === "publish_ready" ||
        rowStatus === "approved" ? (
          <span>
            {rowStatus === "publish_ready" || rowStatus === "approved"
              ? "PUBLISH-READY"
              : "SUBMITTED"}
          </span>
        ) : (
          <div className="panel-directory-actions">
            <button
              className="op-button"
              type="button"
              onClick={() => loadDraft(item)}
            >
              {item.lifecycle_status === "changes_requested"
                ? "REVISE"
                : "CONTINUE"}
            </button>
            <Form method="post" action="/editorial">
              <input type="hidden" name="intent" value="submit-existing" />
              <input type="hidden" name="featureId" value={item.feature_id} />
              <button
                className="op-button action-primary"
                type="submit"
                onClick={() => setSubmitIntent("submit")}
                disabled={pending}
              >
                {pending && submitIntent === "submit"
                  ? "SUBMITTING…"
                  : item.lifecycle_status === "changes_requested"
                    ? "RESUBMIT FOR REVIEW"
                    : "SUBMIT FOR REVIEW"}
              </button>
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
        {result.capabilities.moderation && (
          <Link to="/moderation">MODERATION</Link>
        )}
      </nav>
      <p className="editorial-marker">EDITORIAL DASHBOARD</p>
      <h1>Feature composer</h1>
      <section className="composer-status" aria-label="Composer status">
        <p className="editorial-marker">PANEL STATE</p>
        <strong>
          <span className="panel-status">{durableStatus}</span>
        </strong>
        {selected ? (
          <p>Editing {selected.title}</p>
        ) : (
          <p>New panels begin as private drafts.</p>
        )}
        {selected?.reviewer_note ? (
          <p className="reviewer-note">
            <strong>Reviewer note:</strong> {selected.reviewer_note}
          </p>
        ) : null}
        {isChangesRequested ? (
          <p>
            Make your changes, then resubmit so editors can review the new
            version.
          </p>
        ) : null}
      </section>
      {response && "success" in response && (
        <p
          className={`profile-contribution composer-outcome ${response.status === "submitted" ? "composer-outcome-submitted" : "composer-outcome-saved"}`}
          role="status"
        >
          {response.success}
        </p>
      )}
      {response && "error" in response && (
        <div
          className="profile-contribution composer-outcome composer-outcome-blocked"
          role="alert"
          tabIndex={-1}
          ref={errorSummary}
        >
          <p>{response.error}</p>
          {"issues" in response && (
            <RequirementList issues={submissionIssues} />
          )}
        </div>
      )}
      {response && "success" in response && "featureId" in response && (
        <article
          className="profile-contribution"
          aria-label="Latest saved draft"
        >
          <p>{durableStatus} · Just now</p>
          <strong>{draft.title}</strong>
          <p>{draft.slug}</p>
        </article>
      )}
      {blocker.state==="blocked" && <section role="alert" className="composer-outcome composer-outcome-blocked"><h2>You have unsaved changes</h2><p>Stay here to save your draft, or leave and discard these changes.</p><button className="op-button" onClick={()=>blocker.reset()}>KEEP EDITING</button><button className="op-button" onClick={()=>blocker.proceed()}>LEAVE WITHOUT SAVING</button></section>}
      <Form method="post" action="/editorial" className="op-form" noValidate onSubmit={()=>{sentSignature.current=contentSignature(draft);}}>
        {result.turnstileSiteKey && (
          <SubmissionChallenge
            siteKey={result.turnstileSiteKey}
            attempt={response}
          />
        )}
        <input type="hidden" name="creationKey" value={creationKey} />
        <input
          type="hidden"
          name="expectedUpdatedAt"
          value={expectedUpdatedAt}
        />
        <input type="hidden" name="featureId" value={draft.featureId ?? ""} />
        <input type="hidden" name="currentStatus" value={selectedStatus} />
        <label>
          Title
          <input
            {...attrs("title")}
            spellCheck
            name="title"
            required
            minLength={4}
            maxLength={150}
            value={draft.title}
            onChange={update("title")}
          />
        </label>
        {errors("title")}
        <label>
          Panel address
          <span className="field-help">
            The short URL name for this panel. Use lowercase letters, numbers
            and hyphens.
          </span>
          <input
            {...attrs("slug")}
            name="slug"
            required
            pattern="[a-z0-9-]{3,80}"
            value={draft.slug}
            onChange={update("slug")}
          />
          <span id="slug-help" className="field-help">
            Example: sucker-punch-doing-what-ubisoft-cant
          </span>
        </label>
        {errors("slug")}
        <label>
          Standfirst / summary
          <textarea
            {...attrs("summary")}
            spellCheck
            name="summary"
            required
            minLength={8}
            maxLength={1000}
            value={draft.summary}
            onChange={update("summary")}
          />
        </label>
        {errors("summary")}
        <label>
          Content format
          <select
            {...attrs("format")}
            name="format"
            value={draft.format ?? "essay"}
            onChange={update("format")}
            aria-label="Content format"
          >
            <option value="">Choose format…</option>
            <option value="essay">Essay</option>
          </select>
          <span className="field-help">
            Editorial features use the Essay format for alpha.
          </span>
        </label>
        {errors("format")}
        <label>
          Category
          <select
            {...attrs("categoryId")}
            name="categoryId"
            value={draft.categoryId ?? ""}
            onChange={update("categoryId")}
          >
            <option value="">Use default category</option>
            {result.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {errors("categoryId")}
        <label>
          Upload a feature image
          <span className="field-help">PNG, JPEG or WebP. 5 MB max.</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={uploadFeatureImage}
            disabled={pending || isPublishReady}
          />
        </label>
        {imageUploads.hero && <p className={imageUploads.hero.status==="failed"?"field-error":"field-help"} role={imageUploads.hero.status==="failed"?"alert":"status"}>{imageUploads.hero.message}</p>}
        {draft.image && (
          <img
            className="editorial-image-preview"
            src={draft.image}
            alt={draft.imageAlt || "Uploaded editorial image preview"}
          />
        )}
        <label>
          Image URL or existing asset path
          <span className="field-help">
            Optional fallback. Upload is preferred; the KOMA placeholder appears
            when no image is provided.
          </span>
          <input
            {...attrs("image")}
            name="image"
            placeholder="/assets/koma-feature-placeholder.svg"
            value={draft.image ?? ""}
            onChange={event=>{clearUpload("hero");update("image")(event);}}
          />
        </label>
        {errors("image")}
        <label>
          Image alt text
          <span className="field-help">
            Required when you add an image. Describe the image for readers using
            assistive technology.
          </span>
          <input
            {...attrs("imageAlt")}
            name="imageAlt"
            maxLength={400}
            value={draft.imageAlt ?? ""}
            onChange={event=>{if(imageUploads.hero?.status==="failed")clearUpload("hero");update("imageAlt")(event);}}
          />
        </label>
        {errors("imageAlt")}
        {(draft.image||imageUploads.hero)&&<button type="button" className="op-button" onClick={()=>{clearUpload("hero");setDraft(current=>({...current,image:"",imageAlt:""}));}}>REMOVE FEATURE IMAGE</button>}
        <input type="hidden" name="sections" value={draft.sections} />
        <input type="hidden" name="sectionsJson" value={draft.sectionsJson} />
        <ArticleSectionBuilder
          sections={sections}
          onChange={changeSections}
          upload={uploadFeatureImage}
          uploadStates={imageUploads}
          onImageEdit={clearUpload}
          onRemove={id=>clearUpload(id)}
        />
        <div className="composer-action-help">
          <p>Save keeps this private in MY PANELS.</p>
          <p>
            Submit sends it to the shared Review Inbox for editors and
            moderators.
          </p>
          <p>Drafts are private until submitted.</p>
          {submissionIssues.length > 0 && (
            <div aria-label="Submission requirements">
              <p>
                <strong>{requirementsMessage(submissionIssues.length)}</strong>
              </p>
              <p>Fix these sections. You can still save this draft.</p>
              <RequirementList issues={submissionIssues} />
            </div>
          )}
        </div>
        <div className="profile-actions">
          <button
            className="op-button"
            name="intent"
            value="save"
            onClick={() => setSubmitIntent("save")}
            disabled={pending || uploadPending || isPublishReady}
          >
            {pending && submitIntent === "save"
              ? "SAVING…"
              : isChangesRequested
                ? "SAVE REVISION"
                : "SAVE DRAFT"}
          </button>
          <button
            className="op-button action-primary"
            name="intent"
            value="submit"
            onClick={() => setSubmitIntent("submit")}
            disabled={
              pending || uploadPending || isSubmitted || isPublishReady
            }
          >
            {pending && submitIntent === "submit"
              ? "SUBMITTING…"
              : isSubmitted
                ? "SUBMITTED"
                : isPublishReady
                  ? "PUBLISH-READY"
                  : isChangesRequested
                    ? "RESUBMIT FOR REVIEW"
                    : "SUBMIT FOR REVIEW"}
          </button>
        </div>
      </Form>
      <section
        className="editorial-preview-shell"
        aria-label="Live editorial preview"
      >
        <p className="editorial-marker">LIVE PREVIEW</p>
        {hasComposerContent ? (
          <ArticleRenderer document={preview} />
        ) : (
          <p className="preview-empty">
            Start typing to build the panel preview.
          </p>
        )}
      </section>
      <section>
        <h2>MY PANELS</h2>
        <PanelDirectory
          label="Editorial panels"
          rows={draftRows}
          empty="No saved panels yet."
        />
      </section>
      {result.capabilities.editorial && (
        <section>
          <h2>Review inbox</h2>
          <PanelDirectory
            label="Editorial review inbox"
            rows={reviewRows}
            empty="No submitted drafts waiting."
          />
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
      {result.state !== "accepted" ? (
        <Boundary state={result.state} />
      ) : (
        <FeatureComposer
          result={result as AcceptedLoaderData}
          selectedFeatureId={selectedFeatureId}
        />
      )}
    </main>
  );
}
