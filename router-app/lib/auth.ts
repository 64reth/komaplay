import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { BrowserSupabaseConfig } from "./browser-supabase";
import { safeReturnPath } from "./handbook";
import { publicSupabaseConfig, supabaseServer } from "./supabase.server";

export type PublicMember = {
  id: string;
  displayName: string;
  role: "member" | "contributor" | "moderator" | "admin";
  accountStatus: "active" | "restricted" | "suspended";
};

export type AuthSnapshot =
  | { state: "unconfigured"; member: null }
  | { state: "signed-out"; member: null }
  | { state: "profile-unavailable"; member: null }
  | { state: "authenticated"; member: PublicMember };

export type ResolvedAuth = {
  auth: AuthSnapshot;
  config: BrowserSupabaseConfig | null;
  client: SupabaseClient | null;
  headers: Headers;
  user: User | null;
};

export async function resolveAuth(request: Request): Promise<ResolvedAuth> {
  const context = supabaseServer(request);
  const config = publicSupabaseConfig();
  if (!context.client || !config)
    return {
      auth: { state: "unconfigured", member: null } as AuthSnapshot,
      config: null,
      user: null,
      ...context,
    };

  const { data, error } = await context.client.auth.getUser();
  if (error || !data.user)
    return {
      auth: { state: "signed-out", member: null } as AuthSnapshot,
      config,
      user: null,
      ...context,
    };

  const profile = await context.client
    .from("profiles")
    .select("id,display_name,role,account_status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data)
    return {
      auth: { state: "profile-unavailable", member: null } as AuthSnapshot,
      config,
      user: data.user,
      ...context,
    };

  return {
    auth: {
      state: "authenticated",
      member: {
        id: profile.data.id,
        displayName: profile.data.display_name,
        role: profile.data.role,
        accountStatus: profile.data.account_status,
      },
    },
    config,
    user: data.user,
    ...context,
  };
}

export function authReturnPath(request: Request, fallback = "/") {
  const url = new URL(request.url);
  return safeReturnPath(
    url.searchParams.get("returnTo") ?? url.searchParams.get("next"),
    fallback,
  );
}

export function withQuery(path: string, key: string, value: string) {
  const url = new URL(path, "https://koma.local");
  url.searchParams.set(key, value);
  return url.pathname + url.search;
}
