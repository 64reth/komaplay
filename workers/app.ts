import { createRequestHandler } from "react-router";
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
function exposePublicSupabaseEnv(env: Env) {
  const runtime = env as Record<string, string | undefined>;
  const processEnv = process.env as Record<string, string | undefined>;
  for (const name of [
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]) {
    if (runtime[name]) processEnv[name] = runtime[name];
  }
}

export default {
  fetch(request, env) {
    exposePublicSupabaseEnv(env);
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
