import { createClient } from "@supabase/supabase-js";
import { resolvePublicSupabaseConfig } from "./supabase-config";
import { publicImageBytes } from "./public-image-bytes";

export type MediaGateway = {
  resolve: (id: string) => Promise<{ bucket: string; path: string } | null>;
  download: (bucket: string, path: string) => Promise<Uint8Array | null>;
};
function gateway(): MediaGateway | null {
  const config = resolvePublicSupabaseConfig(),
    key = process.env.SUPABASE_MEDIA_SERVICE_KEY;
  if (!config || !key) return null;
  const client = createClient(config.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, init) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
  return {
    async resolve(id) {
      const r = await client.rpc("resolve_publication_media", {
        reference: id,
      });
      return r.error ? null : (r.data?.[0] ?? null);
    },
    async download(bucket, path) {
      const r = await client.storage.from(bucket).download(path);
      return r.error || !r.data || r.data.size > 5 * 1024 * 1024
        ? null
        : new Uint8Array(await r.data.arrayBuffer());
    },
  };
}
export async function publicMediaResponse(
  id: string,
  service?: MediaGateway | null,
): Promise<Response> {
  const denied = () =>
    new Response("Published image unavailable.", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
  )
    return denied();
  try {
    service = service === undefined ? gateway() : service;
    if (!service) return denied();
    const asset = await service.resolve(id);
    if (
      !asset ||
      ![
        "open-panel-screenshots",
        "editorial-feature-images",
        "issue-cover-pool",
      ].includes(asset.bucket) ||
      asset.path.includes("..") ||
      !asset.path.match(/^[a-z0-9/-]+\.(png|jpg|webp)$/)
    )
      return denied();
    const bytes = await service.download(asset.bucket, asset.path);
    const safe = bytes && publicImageBytes(bytes);
    if (!safe) return denied();
    // Never forward Location, filename, object metadata, storage owner, cookies or upstream errors.
    return new Response(safe.bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": safe.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return denied();
  }
}
