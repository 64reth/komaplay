import { actionFailure } from "../lib/action-feedback";
import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/workshop-action";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";
import { contributionSchema, screenshotError } from "../lib/open-panel";

function reply(body: unknown, status: number, headers: Headers) {
  return data(body, { status, headers });
}

async function member(request: Request) {
  const resolved = await resolveAuth(request);
  if (
    resolved.auth.state !== "authenticated" ||
    !resolved.client ||
    !resolved.user
  )
    return {
      resolved,
      error: reply(
        { error: "Sign in to enter the Workshop." },
        401,
        resolved.headers,
      ),
    };
  if (resolved.auth.member.accountStatus !== "active")
    return {
      resolved,
      error: reply(
        {
          error:
            "Workshop access is unavailable for this account. Contact the editorial team for help or an appeal.",
        },
        403,
        resolved.headers,
      ),
    };
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted")
    return {
      resolved,
      error: reply(
        {
          error:
            handbook.status === "required"
              ? "Accept the current Pocket Guide before participating."
              : "Membership could not be verified.",
        },
        handbook.status === "required" ? 428 : 503,
        resolved.headers,
      ),
    };
  return { resolved, error: null };
}

function databaseError(error: unknown, fallback: string) {
  if (!error) return null;
  const code =
    typeof error === "object" && "code" in error ? String(error.code) : "";
  return {
    status: code === "42501" ? 403 : 409,
    message: actionFailure(error, fallback),
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  if (params.action !== "image")
    return reply({ error: "Workshop endpoint not found." }, 404, new Headers());
  const access = await member(request);
  if (access.error) return access.error;
  const { resolved } = access;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (
    !new RegExp(`^${resolved.user!.id}/[0-9a-f-]{36}\\.(?:png|jpg|webp)$`).test(
      path,
    )
  )
    return reply(
      { error: "This screenshot is unavailable." },
      403,
      resolved.headers,
    );
  const signed = await resolved
    .client!.storage.from("open-panel-screenshots")
    .createSignedUrl(path, 60);
  if (signed.error || !signed.data)
    return reply(
      { error: "This screenshot is unavailable." },
      403,
      resolved.headers,
    );
  return redirect(signed.data.signedUrl, { headers: resolved.headers });
}

export async function action({ request, params }: Route.ActionArgs) {
  const access = await member(request);
  if (access.error) return access.error;
  const { resolved } = access;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply(
      { error: "Same-origin request required." },
      403,
      resolved.headers,
    );

  try {
    if (params.action === "upload") {
      if (
        Number(request.headers.get("content-length") ?? 0) >
        5 * 1024 * 1024 + 65_536
      )
        return reply(
          { error: "Screenshots must be 5 MB or smaller." },
          413,
          resolved.headers,
        );
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return reply({ error: "Choose a screenshot." }, 400, resolved.headers);
      const invalid = screenshotError(file);
      if (invalid) return reply({ error: invalid }, 400, resolved.headers);
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
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (
        !(
          {
            "image/png": png,
            "image/jpeg": jpeg,
            "image/webp": webp,
          } as Record<string, boolean>
        )[file.type]
      )
        return reply(
          { error: "The file contents do not match its image type." },
          400,
          resolved.headers,
        );
      const extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      }[file.type];
      const path = `${resolved.user!.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await resolved
        .client!.storage.from("open-panel-screenshots")
        .upload(path, bytes, { contentType: file.type, upsert: false });
      const failure = databaseError(
        upload.error,
        "The screenshot could not be uploaded.",
      );
      return failure
        ? reply({ error: failure.message }, failure.status, resolved.headers)
        : reply({ path }, 200, resolved.headers);
    }

    if (Number(request.headers.get("content-length") ?? 0) > 20_000)
      return reply({ error: "Request too large." }, 413, resolved.headers);
    const raw = z.record(z.string(), z.unknown()).parse(await request.json());

    if (params.action === "save") {
      const parsed = contributionSchema.parse(raw);
      const existingId = raw.id ? z.string().uuid().parse(raw.id) : null;
      const accepts = await resolved.client!.rpc(
        "feature_accepts_contributions",
        {
          target: parsed.feature_id,
        },
      );
      if (accepts.error || accepts.data !== true)
        return reply(
          {
            error:
              "This Workshop is closed. Use Report a Correction for factual concerns.",
          },
          403,
          resolved.headers,
        );

      if (!existingId) {
        const recent = await resolved
          .client!.from("contributions")
          .select("id")
          .eq("author_id", resolved.user!.id)
          .eq("feature_id", parsed.feature_id)
          .eq("title", parsed.title)
          .eq("body", parsed.body)
          .eq("status", "Submitted")
          .is("withdrawn_at", null)
          .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
          .limit(1)
          .maybeSingle();
        if (!recent.error && recent.data)
          return reply(
            { id: recent.data.id, duplicate: true },
            200,
            resolved.headers,
          );
      }

      const saved = await resolved.client!.rpc("save_contribution", {
        payload: parsed,
        contribution_id: existingId,
      });
      const failure = databaseError(
        saved.error,
        "The contribution was not saved. Refresh and check its current status.",
      );
      return failure
        ? reply({ error: failure.message }, failure.status, resolved.headers)
        : reply({ id: saved.data, duplicate: false }, 200, resolved.headers);
    }

    if (params.action === "withdraw") {
      const id = z.string().uuid().parse(raw.id);
      const withdrawn = await resolved.client!.rpc("withdraw_contribution", {
        target: id,
      });
      const failure = databaseError(
        withdrawn.error,
        "The contribution could not be withdrawn.",
      );
      return failure
        ? reply({ error: failure.message }, failure.status, resolved.headers)
        : reply({ ok: true }, 200, resolved.headers);
    }

    return reply(
      { error: "Workshop endpoint not found." },
      404,
      resolved.headers,
    );
  } catch (error) {
    return reply(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((issue) => issue.message).join(" ")
            : "The Workshop could not complete this request. Please retry.",
      },
      error instanceof z.ZodError ? 400 : 503,
      resolved.headers,
    );
  }
}
