import type { Route } from "./+types/cover-image";
import { signedArchivedCoverImage } from "../lib/publication.server";
export async function loader({request}:Route.LoaderArgs){const path=new URL(request.url).searchParams.get("path")??"";const url=await signedArchivedCoverImage(path);return url?Response.redirect(url,302):new Response("Cover image unavailable.",{status:404});}
