import { data } from "react-router";
import type { Route } from "./+types/editorial-upload";
import { resolveAuth } from "../lib/auth";
import { editorialImageBucket, editorialImageMimeExtensions, maxEditorialImageBytes, slugPart, validateImageBytes } from "../lib/editorial-media.server";
import { membershipState } from "../lib/membership.server";

function reply(body: unknown, status: number, headers = new Headers()) {
  return data(body, { status, headers });
}

async function editorialMember(request: Request) {
  const resolved = await resolveAuth(request);
  if (resolved.auth.state !== "authenticated" || !resolved.client || !resolved.user) return { resolved, error: reply({ error: "Sign in to upload editorial images." }, 401, resolved.headers) };
  if (resolved.auth.member.accountStatus !== "active") return { resolved, error: reply({ error: "Editorial access is unavailable for this account." }, 403, resolved.headers) };
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted") return { resolved, error: reply({ error: "Accept the current Pocket Guide before uploading editorial images." }, handbook.status === "required" ? 428 : 503, resolved.headers) };
  const access = await resolved.client.rpc("editorial_has_access", { target: resolved.user.id, review: false });
  if (access.error || access.data !== true) return { resolved, error: reply({ error: "Editorial access is required." }, 403, resolved.headers) };
  return { resolved, error: null };
}

export async function action({ request }: Route.ActionArgs) {
  const access = await editorialMember(request);
  if (access.error) return access.error;
  const { resolved } = access;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Same-origin request required." }, 403, resolved.headers);
  if (Number(request.headers.get("content-length") ?? 0) > maxEditorialImageBytes + 65_536) return reply({ error: "Images must be 5 MB or smaller." }, 413, resolved.headers);
  const form = await request.formData();
  const file = form.get("file");
  const slug = slugPart(String(form.get("slug") ?? ""));
  if (!slug) return reply({ error: "Add a slug before uploading an image." }, 400, resolved.headers);
  if (!(file instanceof File)) return reply({ error: "Choose an image." }, 400, resolved.headers);
  if (!editorialImageMimeExtensions[file.type]) return reply({ error: "Use PNG, JPEG or WebP." }, 400, resolved.headers);
  if (file.size > maxEditorialImageBytes) return reply({ error: "Images must be 5 MB or smaller." }, 413, resolved.headers);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateImageBytes(bytes, file.type)) return reply({ error: "Use PNG, JPEG or WebP." }, 400, resolved.headers);
  const path = `editorial/${resolved.user!.id}/${slug}/${crypto.randomUUID()}.${editorialImageMimeExtensions[file.type]}`;
  const upload = await resolved.client!.storage.from(editorialImageBucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return reply({ error: "The image could not be uploaded." }, 409, resolved.headers);
  return reply({ path, url: `/api/editorial/image?path=${path}` }, 200, resolved.headers);
}
