"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";
let client: ReturnType<typeof createBrowserClient> | null | undefined;
export function browserClient() {
  if (client !== undefined) return client;
  const config = supabaseConfig();
  client = config ? createBrowserClient(config.url, config.key) : null;
  return client;
}
