import { safeReturnPath } from "./domain";

export type OnboardingRouteOutcome =
  "signed-out" | "required" | "accepted" | "restricted" | "unavailable";

export function onboardingRouteOutcome({
  session,
  accountStatus,
  handbookStatus,
}: {
  session: boolean;
  accountStatus?: "active" | "restricted" | "suspended";
  handbookStatus?: "accepted" | "required" | "unavailable";
}): OnboardingRouteOutcome {
  if (!session) return "signed-out";
  if (accountStatus && accountStatus !== "active") return "restricted";
  if (handbookStatus === "accepted") return "accepted";
  if (handbookStatus === "required") return "required";
  return "unavailable";
}

export function onboardingReturnDestination(returnTo: unknown) {
  const destination = safeReturnPath(returnTo, "/profile");
  return destination === "/onboarding" ? "/profile" : destination;
}
