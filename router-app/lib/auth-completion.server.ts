import type { ResolvedAuth } from "./auth";
import { safeReturnPath, onboardingHref } from "./handbook";
import { membershipState } from "./membership.server";

export async function completionStatus(
  resolved: ResolvedAuth,
  returnTo: unknown,
) {
  if (
    resolved.auth.state !== "authenticated" ||
    !resolved.client ||
    !resolved.user
  )
    return { state: "pending" as const };
  const destination = safeReturnPath(returnTo, "/profile");
  if (resolved.auth.member.accountStatus !== "active")
    return { state: "ready" as const, next: onboardingHref(destination) };
  const membership = await membershipState(resolved.client, resolved.user.id);
  if (membership.status === "unavailable") return { state: "pending" as const };
  return {
    state: "ready" as const,
    next:
      membership.status === "required"
        ? onboardingHref(destination)
        : destination,
  };
}
