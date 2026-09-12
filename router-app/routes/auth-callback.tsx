import { redirect } from "react-router";
import type { Route } from "./+types/auth-callback";
import { authReturnPath, withQuery } from "../lib/auth";
import { supabaseServer } from "../lib/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const destination = authReturnPath(request, "/onboarding");
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const context = supabaseServer(request);
  if (!context.client || !code)
    return redirect(withQuery(destination, "auth_error", "expired"), {
      headers: context.headers,
    });

  const { error } = await context.client.auth.exchangeCodeForSession(code);
  if (error)
    return redirect(withQuery(destination, "auth_error", "expired"), {
      headers: context.headers,
    });
  return redirect(destination, { headers: context.headers });
}
