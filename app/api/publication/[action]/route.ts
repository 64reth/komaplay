import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  communityIdentity,
  HttpError,
} from "../../../../lib/open-panel/server";
import { catalogue } from "../../../../lib/publication/server";
import {
  schemas,
  correctionSchema,
} from "../../../../lib/publication/validation";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const failure = (e: unknown) =>
  json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join(" ")
            : "Publication service unavailable. Check setup and retry.",
    },
    e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503,
  );
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    const { db, profile } = await communityIdentity(true, "/publishing");
    if (action === "overview") {
      if (profile.role !== "admin")
        throw new HttpError(403, "Administrator access required.");
      const data = await catalogue(true);
      const [pending, corrections] = await Promise.all([
        db
          .from("contributions")
          .select("id", { count: "exact", head: true })
          .is("withdrawn_at", null)
          .in("status", ["Submitted", "In Review", "Changes Requested"]),
        db
          .from("correction_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["Submitted", "In Review"]),
      ]);
      if (pending.error || corrections.error)
        throw new Error("Queue unavailable");
      return json({
        data,
        pending: pending.count,
        corrections: corrections.count,
      });
    }
    if (action === "corrections") {
      let query = db
        .from("correction_reports")
        .select("*")
        .order("created_at", { ascending: false });
      const status = request.nextUrl.searchParams.get("status");
      if (status) query = query.eq("status", status);
      const page = Math.max(
        0,
        Number(request.nextUrl.searchParams.get("page")) || 0,
      );
      const { data, error } = await query.range(page * 25, page * 25 + 24);
      if (error) throw error;
      const audit = await db
        .from("correction_audit")
        .select("*")
        .in(
          "report_id",
          (data ?? []).map((r) => r.id),
        )
        .order("created_at");
      if (audit.error) throw audit.error;
      return json({ reports: data, audit: audit.data });
    }
    throw new HttpError(404, "Unknown publication endpoint.");
  } catch (e) {
    return failure(e);
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
    const { db, profile } = await communityIdentity(
      action !== "correction",
      "/",
    );
    if (Number(request.headers.get("content-length")) > 65000)
      throw new HttpError(413, "Request too large.");
    if (action === "correction") {
      const input = correctionSchema.parse(await request.json());
      const { data, error } = await db.rpc("submit_correction", {
        target: input.feature_id,
        report_kind: input.kind,
        report_body: input.body,
        source: input.source_url,
      });
      if (error) throw new HttpError(409, error.message);
      return json({ id: data });
    }
    if (action === "review-correction") {
      const input = z
        .object({
          id: z.string().uuid(),
          status: z.enum(["In Review", "Resolved", "Dismissed"]),
          note: z.string().trim().min(4).max(2000),
        })
        .parse(await request.json());
      const { error } = await db.rpc("review_correction", {
        target: input.id,
        decision: input.status,
        note: input.note,
      });
      if (error) throw new HttpError(409, error.message);
      return json({ ok: true });
    }
    if (profile.role !== "admin")
      throw new HttpError(403, "Administrator access required.");
    if (action === "reconcile") {
      const { error } = await db.rpc("reconcile_publication");
      if (error) throw new HttpError(409, error.message);
      return json({ ok: true });
    }
    if (!(action in schemas))
      throw new HttpError(404, "Unknown publishing action.");
    const payload = schemas[action as keyof typeof schemas].parse(
      await request.json(),
    );
    const { data, error } = await db.rpc("manage_publication", {
      kind: action,
      payload,
    });
    if (error) throw new HttpError(409, error.message);
    return json({ id: data });
  } catch (e) {
    return failure(e);
  }
}
