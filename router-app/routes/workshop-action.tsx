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
  resolved.headers.set("Cache-Control","private, no-store");
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
  const access = await member(request);
  if (access.error) return access.error;
  const { resolved } = access;
  if(params.action==="draft"){
    const url=new URL(request.url);let q=resolved.client!.from("workshop_drafts").select("*").eq("user_id",resolved.user!.id).eq("feature_id",url.searchParams.get("feature"));
    if(url.searchParams.get("id"))q=q.eq("id",url.searchParams.get("id"));else q=q.is("submitted_contribution_id",null);
    const result=await q.order("updated_at",{ascending:false}).limit(1).maybeSingle();
    return reply(result.error?{error:"Draft could not be loaded. Your local work is retained."}:{draft:result.data},result.error?503:200,resolved.headers);
  }
  if(params.action!=="image")return reply({error:"Unknown endpoint"},404,resolved.headers);
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

    if(params.action==="draft"){
      const input=z.object({id:z.string().uuid(),feature_id:z.string().uuid(),expected_version:z.number().int().min(0),payload:z.record(z.string(),z.union([z.string().max(8000),z.boolean()])),revision_target:z.string().uuid().nullable()}).parse(raw);
      const result=await resolved.client!.rpc("save_workshop_draft",{draft_id:input.id,target_feature:input.feature_id,expected_version:input.expected_version,content:input.payload,target_contribution:input.revision_target});
      return reply(result.error?{error:result.error.code==="P4090"?"Newer or submitted draft exists. Keep your local copy or load the server version.":actionFailure(result.error,"Draft could not be saved. Your local writing is retained.")}:{draft:result.data},result.error?409:200,resolved.headers);
    }
    if(params.action==="submit-draft"){
      const input=z.object({id:z.string().uuid(),version:z.number().int().positive()}).parse(raw);
      const row=await resolved.client!.from("workshop_drafts").select("payload,feature_id").eq("id",input.id).eq("user_id",resolved.user!.id).single();
      if(row.error)return reply({error:"Draft unavailable."},404,resolved.headers);
      contributionSchema.parse({...row.data.payload,feature_id:row.data.feature_id});
      const result=await resolved.client!.rpc("submit_workshop_draft",{draft_id:input.id,expected_version:input.version});
      return reply(result.error?{error:actionFailure(result.error,"Submission was not confirmed. Your draft is retained; retry safely.")}:{id:result.data},result.error?409:200,resolved.headers);
    }
    if (params.action === "save") {
      const parsed=contributionSchema.parse(raw);
      const result=await resolved.client!.rpc("save_contribution",{payload:{...parsed,...(raw.request_key?{request_key:z.string().uuid().parse(raw.request_key)}:{})},contribution_id:raw.id?z.string().uuid().parse(raw.id):null});
      return reply(result.error?{error:actionFailure(result.error,"Submission was not confirmed. Retry safely.")}:{id:result.data,duplicate:false},result.error?409:200,resolved.headers);
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
