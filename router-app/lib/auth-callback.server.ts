import { redirect } from "react-router";
import { authReturnPath, withQuery } from "./auth";
import type { SupabaseRequest } from "./supabase.server";

export async function completeAuthentication(
  request: Request,
  context: SupabaseRequest,
) {
  const destination = authReturnPath(request, "/onboarding");
  const url = new URL(request.url);
  const failure = (reason: string) =>
    redirect(withQuery(destination, "auth_error", reason), {
      headers: context.headers,
    });
  context.headers.set("Referrer-Policy", "no-referrer");
  context.headers.set("Cache-Control", "private, no-store");
  if (url.searchParams.has("error"))
    return failure(
      url.searchParams.get("error") === "access_denied"
        ? "cancelled"
        : "unavailable",
    );
  const code = url.searchParams.get("code");
  if (!context.client) return failure("unavailable");
  if (!code || code.length > 2048) return failure("expired");
  try {
    const { error } = await context.client.auth.exchangeCodeForSession(code);
    if (error) {
      console.info(
        JSON.stringify({
          event: "auth_callback_exchange",
          outcome: "rejected",
        }),
      );
      return failure("expired");
    }
    console.info(
      JSON.stringify({
        event: "auth_callback_exchange",
        outcome: "established",
      }),
    );
    return redirect(withQuery("/auth/complete", "returnTo", destination), {
      headers: context.headers,
    });
  } catch {
    return failure("unavailable");
  }
}
