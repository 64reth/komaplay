export type PublicSupabaseConfig = {
  url: string;
  key: string;
};

type EnvLike = Record<string, string | undefined>;

const urlNames = [
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

const keyNames = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

function firstPresent(env: EnvLike, names: readonly string[]) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function resolvePublicSupabaseConfig(
  env: EnvLike = process.env,
): PublicSupabaseConfig | null {
  const url = firstPresent(env, urlNames);
  const key = firstPresent(env, keyNames);
  return url && key ? { url, key } : null;
}

export function publicSupabaseVariablePresence(env: EnvLike) {
  return {
    url: Object.fromEntries(urlNames.map((name) => [name, Boolean(env[name])])),
    key: Object.fromEntries(keyNames.map((name) => [name, Boolean(env[name])])),
  };
}
