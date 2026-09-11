import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serverClient } from "../../../../lib/supabase/server";
import {
  identity,
  communityIdentity,
  HttpError,
} from "../../../../lib/open-panel/server";
import {
  contributionSchema,
  moderationSchema,
  screenshotError,
} from "../../../../lib/open-panel/domain";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : "Open Panel could not complete this request. Please retry or check the Supabase setup.",
      ...(error instanceof Error && "onboardingUrl" in error
        ? { onboarding_url: (error as { onboardingUrl: string }).onboardingUrl }
        : {}),
    },
    error instanceof HttpError ? error.status : 503,
  );
}
function requestReturnPath(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/")
    ? "/"
    : request.nextUrl.pathname + request.nextUrl.search;
}
function check(error: { message: string; code?: string } | null) {
  if (error)
    throw new HttpError(
      error.code === "42501" ? 403 : 409,
      "The operation was not saved. It may have changed since you opened it; refresh and check its status.",
    );
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "image") {
      const path = request.nextUrl.searchParams.get("path") ?? "";
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(path))
        throw new HttpError(400, "Invalid image path.");
      const db = await serverClient();
      if (!db) throw new HttpError(503, "Storage needs Supabase setup.");
      const { data, error } = await db.storage
        .from("open-panel-screenshots")
        .createSignedUrl(path, 60);
      if (error || !data)
        throw new HttpError(403, "This screenshot is unavailable or private.");
      return NextResponse.redirect(data.signedUrl, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const sessionAction = action === "session";
    const { db, user, profile } = sessionAction
      ? await identity()
      : await communityIdentity(
          action === "queue" || action === "audit" || action === "profiles",
          requestReturnPath(request),
        );
    if (action === "session")
      return json({
        user: {
          id: user.id,
          display_name: profile.display_name,
          role: profile.role,
        },
      });
    if (action === "profiles") {
      if (profile.role !== "admin")
        throw new HttpError(403, "Administrator access required.");
      const { data, error } = await db
        .from("profiles")
        .select("id,display_name,role")
        .order("created_at")
        .limit(200);
      check(error);
      return json({ profiles: data });
    }
    if (action === "audit") {
      const id = z
        .string()
        .uuid()
        .parse(request.nextUrl.searchParams.get("id"));
      const { data, error } = await db
        .from("moderation_audit")
        .select("*")
        .eq("contribution_id", id)
        .order("created_at");
      check(error);
      return json({ audit: data });
    }
    if (action !== "queue" && action !== "mine")
      throw new HttpError(404, "Unknown Open Panel endpoint.");
    let query = db
      .from("contributions")
      .select("*", { count: "exact" })
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false });
    if (action === "mine") query = query.eq("author_id", user.id);
    const q = request.nextUrl.searchParams;
    for (const key of ["feature_id", "status", "type"])
      if (q.get(key)) query = query.eq(key, q.get(key));
    if (q.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("date")!))
      query = query.gte("created_at", `${q.get("date")}T00:00:00Z`);
    const page = Math.max(0, Math.min(10000, Number(q.get("page")) || 0));
    const { data, error, count } = await query.range(page * 25, page * 25 + 24);
    check(error);
    const [authors, features] = await Promise.all([
      db
        .from("public_profiles")
        .select("id,display_name")
        .in("id", [...new Set((data ?? []).map((c) => c.author_id))]),
      db.from("features").select("id,title,slug").order("title"),
    ]);
    check(authors.error);
    check(features.error);
    return json({
      contributions: (data ?? []).map((c) => ({
        ...c,
        author: authors.data?.find((a) => a.id === c.author_id),
        feature: features.data?.find((f) => f.id === c.feature_id),
      })),
      features: features.data,
      count,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new HttpError(403, "Same-origin request required.");
    const { action } = await params;
    const { db, user, profile } = await communityIdentity(
      action === "moderate" || action === "role",
      requestReturnPath(request),
    );
    if (action === "upload") {
      if (
        Number(request.headers.get("content-length")) >
        5 * 1024 * 1024 + 65536
      )
        throw new HttpError(400, "Screenshots must be 5 MB or smaller.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        throw new HttpError(400, "Choose a screenshot.");
      const invalid = screenshotError(file);
      if (invalid) throw new HttpError(400, invalid);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10;
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (
        !{ "image/png": png, "image/jpeg": jpg, "image/webp": webp }[file.type]
      )
        throw new HttpError(
          400,
          "The file contents do not match its image type.",
        );
      const ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      }[file.type];
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage
        .from("open-panel-screenshots")
        .upload(path, bytes, { contentType: file.type, upsert: false });
      check(error);
      return json({ path });
    }
    if (Number(request.headers.get("content-length")) > 20000)
      throw new HttpError(413, "Request too large.");
    const raw = z.record(z.string(), z.unknown()).parse(await request.json());
    if (action === "save") {
      const payload = contributionSchema.parse(raw);
      const id = raw.id ? z.string().uuid().parse(raw.id) : null;
      const { data: accepts } = await db.rpc("feature_accepts_contributions", {
        target: payload.feature_id,
      });
      if (!accepts)
        throw new HttpError(
          403,
          "This Workshop is closed. Use Report a Correction for factual concerns.",
        );
      const { data, error } = await db.rpc("save_contribution", {
        payload,
        contribution_id: id,
      });
      check(error);
      return json({ id: data });
    }
    if (action === "withdraw") {
      const { error } = await db.rpc("withdraw_contribution", {
        target: z.string().uuid().parse(raw.id),
      });
      check(error);
      return json({ ok: true });
    }
    if (action === "moderate") {
      const input = moderationSchema.parse(raw);
      const { error } = await db.rpc("moderate_contribution", {
        target: input.id,
        decision: input.status,
        published_heading: input.heading,
        published_body: input.body,
        note: input.note,
      });
      check(error);
      return json({ ok: true });
    }
    if (action === "role") {
      if (profile.role !== "admin")
        throw new HttpError(403, "Administrator access required.");
      const input = z
        .object({
          id: z.string().uuid(),
          role: z.enum(["member", "contributor", "moderator", "admin"]),
        })
        .parse(raw);
      const { error } = await db.rpc("grant_open_panel_role", {
        target: input.id,
        new_role: input.role,
      });
      check(error);
      return json({ ok: true });
    }
    throw new HttpError(404, "Unknown Open Panel endpoint.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: error.issues.map((i) => i.message).join(" ") }, 400);
    return failure(error);
  }
}
