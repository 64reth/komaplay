import { data } from "react-router";
import { resolveAuth } from "./auth";
import { membershipState } from "./membership.server";

export async function requireCoverCommittee(request: Request) {
  const resolved = await resolveAuth(request);
  resolved.headers.set("Cache-Control", "private, no-store");
  resolved.headers.set("Vary", "Cookie");
  if (resolved.auth.state !== "authenticated" || !resolved.client || !resolved.user)
    throw data("Sign in to access the Cover Pool.", { status: 401, headers: resolved.headers });
  if (resolved.auth.member.accountStatus !== "active" || !["moderator", "admin"].includes(resolved.auth.member.role))
    throw data("Cover committee access required.", { status: 403, headers: resolved.headers });
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted") throw data("Accept the current Pocket Guide first.", { status: 403, headers: resolved.headers });
  return { ...resolved, client: resolved.client, user: resolved.user };
}
