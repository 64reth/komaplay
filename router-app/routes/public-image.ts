import type { Route } from "./+types/public-image";
import { signedPublishedImage } from "../lib/publication.server";

export async function loader({ request }: Route.LoaderArgs) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const signedUrl = await signedPublishedImage(path);
  if (!signedUrl)
    return new Response("Published image unavailable.", { status: 404 });
  return Response.redirect(signedUrl, 302);
}
