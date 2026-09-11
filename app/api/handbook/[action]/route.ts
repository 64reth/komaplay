import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { identity, HttpError } from "../../../../lib/open-panel/server";
import { handbookState } from "../../../../lib/handbook/server";
import {
  handbookPanels,
  safeReturnPath,
} from "../../../../lib/handbook/domain";
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
          : error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join(" ")
            : "The handbook service is unavailable. Please retry.",
    },
    error instanceof HttpError
      ? error.status
      : error instanceof z.ZodError
        ? 400
        : 503,
  );
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    const { db, user, profile } = await identity();
    if (action === "status") return json(await handbookState(db, user.id));
    if (action !== "versions")
      throw new HttpError(404, "Handbook endpoint not found.");
    if (profile.role !== "admin")
      throw new HttpError(403, "Administrator access required.");
    const [versions, counts] = await Promise.all([
      db
        .from("handbook_versions")
        .select("*")
        .order("created_at", { ascending: false }),
      db.rpc("handbook_acceptance_counts"),
    ]);
    if (versions.error || counts.error)
      throw new HttpError(
        503,
        "Handbook versions could not be loaded. Apply the handbook migration and retry.",
      );
    return json({ versions: versions.data, counts: counts.data });
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
    if (Number(request.headers.get("content-length")) > 4000)
      throw new HttpError(413, "Request too large.");
    const { action } = await params;
    const { db, profile } = await identity();
    if (action === "accept") {
      const input = z
        .object({
          version_id: z.string().uuid(),
          content_hash: z.string().regex(/^[a-f0-9]{64}$/),
          statement_version: z.string().max(100),
          consent: z.literal(true, {
            errorMap: () => ({
              message:
                "Please explicitly accept the compact before continuing.",
            }),
          }),
          returnTo: z.string().max(1000).optional(),
        })
        .parse(await request.json());
      const { data, error } = await db.rpc("accept_handbook", {
        target: input.version_id,
        expected_hash: input.content_hash,
        statement: input.statement_version,
        consent: input.consent,
      });
      if (error)
        throw new HttpError(
          409,
          "Acceptance was not recorded. The active version may have changed; load the current handbook and try again.",
        );
      return json({
        accepted_at: data,
        returnTo: safeReturnPath(input.returnTo),
      });
    }
    if (profile.role !== "admin")
      throw new HttpError(403, "Administrator access required.");
    if (action === "activate") {
      const input = z
        .object({ id: z.string().uuid() })
        .parse(await request.json());
      const { data, error } = await db
        .from("handbook_versions")
        .select("content")
        .eq("id", input.id)
        .single();
      if (error || !data)
        throw new HttpError(404, "Prepared version not found.");
      if (!handbookPanels(data.content))
        throw new HttpError(
          409,
          "This prepared version needs the four handbook sections before activation.",
        );
      const result = await db.rpc("activate_handbook_version", {
        target: input.id,
      });
      if (result.error)
        throw new HttpError(
          409,
          "The prepared version could not be activated.",
        );
      return json({ ok: true });
    }
    throw new HttpError(404, "Handbook endpoint not found.");
  } catch (e) {
    return failure(e);
  }
}
