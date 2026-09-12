import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/member-handbook";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";

const acceptanceSchema = z.object({
  versionId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  statementVersion: z.string().max(100),
  consent: z.literal(true),
  returnTo: z.string().max(1000).optional(),
});

function response(error: string, status: number, headers: Headers) {
  return data({ error }, { status, headers });
}

export async function action({ request }: Route.ActionArgs) {
  const resolved = await resolveAuth(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return response("Same-origin request required.", 403, resolved.headers);
  if (Number(request.headers.get("content-length") ?? 0) > 4_000)
    return response("Request too large.", 413, resolved.headers);
  if (
    resolved.auth.state !== "authenticated" ||
    !resolved.client ||
    !resolved.user
  )
    return response(
      "Sign in before accepting the Pocket Guide.",
      401,
      resolved.headers,
    );
  if (resolved.auth.member.accountStatus !== "active")
    return response(
      "Member access is unavailable for this account.",
      403,
      resolved.headers,
    );

  try {
    const input = acceptanceSchema.parse(await request.json());
    const current = await membershipState(resolved.client, resolved.user.id);
    if (
      !current.version ||
      current.version.id !== input.versionId ||
      current.version.content_hash !== input.contentHash ||
      current.version.statement_version !== input.statementVersion
    )
      return response(
        "The active Pocket Guide changed. Reload it before accepting.",
        409,
        resolved.headers,
      );
    const result = await resolved.client.rpc("accept_handbook", {
      target: input.versionId,
      expected_hash: input.contentHash,
      statement: input.statementVersion,
      consent: input.consent,
    });
    if (result.error || !result.data)
      return response(
        "Acceptance was not recorded. Reload the active Pocket Guide and try again.",
        409,
        resolved.headers,
      );
    return data({ acceptedAt: result.data }, { headers: resolved.headers });
  } catch (error) {
    return response(
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join(" ")
        : "The Pocket Guide service is unavailable. Please retry.",
      error instanceof z.ZodError ? 400 : 503,
      resolved.headers,
    );
  }
}
