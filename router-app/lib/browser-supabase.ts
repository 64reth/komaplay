import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BrowserSupabaseConfig = {
  url: string;
  key: string;
  authCallbackOrigin: string;
};
let browser: SupabaseClient | null = null;
let signature = "";

export function supabaseBrowser(config: BrowserSupabaseConfig | null) {
  if (!config || typeof window === "undefined") return null;
  const next = config.url + "\n" + config.key;
  if (!browser || signature !== next) {
    browser = createBrowserClient(config.url, config.key, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: location.protocol === "https:",
      },
    });
    signature = next;
  }
  return browser;
}
