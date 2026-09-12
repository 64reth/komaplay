import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTION_ORIGIN, requestAuthOrigin } from "./auth-origin";
import { resolvePublicSupabaseConfig } from "./supabase-config";

export type SupabaseRequest = {
  client: SupabaseClient | null;
  headers: Headers;
};

export function publicSupabaseConfig(request?: Request) {
  const config = resolvePublicSupabaseConfig();
  return config
    ? {
        ...config,
        authCallbackOrigin: request
          ? requestAuthOrigin(request)
          : PRODUCTION_ORIGIN,
      }
    : null;
}

export function supabaseServer(request: Request): SupabaseRequest {
  const config = publicSupabaseConfig(request);
  const headers = new Headers({
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  });
  if (!config) return { client: null, headers };

  const incoming = parseCookieHeader(request.headers.get("cookie") ?? "");
  const secure = new URL(request.url).protocol === "https:";
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => incoming,
      setAll: (values, responseHeaders) => {
        for (const [name, value] of Object.entries(responseHeaders))
          headers.set(name, value);
        for (const { name, value, options } of values) {
          headers.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, {
              ...options,
              path: "/",
              sameSite: options.sameSite ?? "lax",
              secure,
            }),
          );
        }
      },
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(10_000),
        }),
    },
  });
  return { client, headers };
}
