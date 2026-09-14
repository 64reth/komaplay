import { redirect } from "react-router";
import { createClient } from "@supabase/supabase-js";
import type { Route } from "./+types/editorial-image";
import { resolveAuth } from "../lib/auth";
import { editorialImageBucket, editorialImagePathPattern } from "../lib/editorial-media.server";
import { resolvePublicSupabaseConfig } from "../lib/supabase-config";

export async function loader({ request }: Route.LoaderArgs) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  if (!editorialImagePathPattern().test(path)) return new Response("Editorial image unavailable.", { status: 404 });
  const resolved = await resolveAuth(request);
  const config = resolvePublicSupabaseConfig();
  const client = resolved.client ?? (config ? createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null);
  if (!client) return new Response("Editorial image unavailable.", { status: 404 });
  const signed = await client.storage.from(editorialImageBucket).createSignedUrl(path, 60);
  if (signed.error || !signed.data) return new Response("Editorial image unavailable.", { status: 404 });
  return redirect(signed.data.signedUrl);
}
