import { runIssueRollover } from "./issue-rollover";
import { createRequestHandler } from "react-router";
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);
function exposePublicSupabaseEnv(env: Env) {
  const runtime = env as Env & Record<string, string | undefined>;
  const processEnv = process.env as Env & Record<string, string | undefined>;
  for (const name of [
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET",
    "SUPABASE_MEDIA_SERVICE_KEY",
    "TURNSTILE_HOSTNAMES",
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
  async scheduled(_event, env) {
    if (String(env.ISSUE_ROLLOVER_ENABLED) !== "true") return;
    const runtime = env as Env & Record<string, string | undefined>;
    const result = await runIssueRollover(runtime.SUPABASE_URL ?? runtime.VITE_SUPABASE_URL ?? runtime.NEXT_PUBLIC_SUPABASE_URL, runtime.SUPABASE_MEDIA_SERVICE_KEY);
    console.log(JSON.stringify({ event: "monthly-issue-rollover", result }));
  },
  fetch(request, env) {
    exposePublicSupabaseEnv(env);
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
