import { actionFailure } from "../lib/action-feedback";
import {
  imageDimensions,
  safeImageDimensions,
} from "../lib/editorial-media.server";
import { data } from "react-router";
import type { Route } from "./+types/cover-pool-upload";
import { requireCoverCommittee } from "../lib/cover-pool.server";
import {
  editorialImageMimeExtensions,
  maxEditorialImageBytes,
  slugPart,
  validateImageBytes,
} from "../lib/editorial-media.server";


function reply(body: unknown, status: number, headers = new Headers()) {
  return data(body, { status, headers });
}

export async function action({ request }: Route.ActionArgs) {
  const resolved = await requireCoverCommittee(request);
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return reply(
      { error: "Same-origin request required." },
      403,
      resolved.headers,
    );
  if (
    Number(request.headers.get("content-length") ?? 0) >
    maxEditorialImageBytes + 65_536
  )
    return reply(
      { error: "Images must be 5 MB or smaller." },
      413,
      resolved.headers,
    );
  const form = await request.formData();
  const file = form.get("file");
  const slug = slugPart(String(form.get("slug") ?? ""));
  if (slug.length < 3)
    return reply(
      { error: "Add a slug before uploading an image." },
      400,
      resolved.headers,
    );
  if (!(file instanceof File))
    return reply({ error: "Choose an image." }, 400, resolved.headers);
  if (!editorialImageMimeExtensions[file.type])
    return reply({ error: "Use PNG, JPEG or WebP." }, 400, resolved.headers);
  if (file.size > maxEditorialImageBytes)
    return reply(
      { error: "Images must be 5 MB or smaller." },
      413,
      resolved.headers,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateImageBytes(bytes, file.type))
    return reply({ error: "Use PNG, JPEG or WebP." }, 400, resolved.headers);
  if (!safeImageDimensions(imageDimensions(bytes, file.type)))
    return reply(
      {
        error:
          "Choose an image up to 8,000 pixels on either side and 40 megapixels overall.",
      },
      400,
      resolved.headers,
    );
  const path = `cover-pool/${crypto.randomUUID()}/${crypto.randomUUID()}.${editorialImageMimeExtensions[file.type]}`;
  const upload = await resolved
    .client!.storage.from("issue-cover-pool")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return reply({error:actionFailure(upload.error,"The cover image could not be uploaded. Please retry.")},409,resolved.headers);
  return reply(
    { path, url: `/member/cover-pool/image?path=${path}` },
    200,
    resolved.headers,
  );
}
