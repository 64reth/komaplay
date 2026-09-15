import { resolveAuth } from "../lib/auth";
import { completionStatus } from "../lib/auth-completion.server";
export function loader() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}
export async function action({ request }: { request: Request }) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ state: "pending" }, { status: 403, headers });
  try {
    const body = (await request.json()) as { returnTo?: unknown };
    const resolved = await resolveAuth(request);
    for (const cookie of resolved.headers.getSetCookie())
      headers.append("Set-Cookie", cookie);
    const completion = await completionStatus(resolved, body.returnTo);
    console.info(
      JSON.stringify({
        event: "auth_completion",
        authState: resolved.auth.state,
        outcome: completion.state,
      }),
    );
    return Response.json(completion, { headers });
  } catch {
    return Response.json({ state: "pending" }, { status: 503, headers });
  }
}
