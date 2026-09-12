export type WorkshopAccessInput = {
  auth: "signed-out" | "unconfigured" | "profile-unavailable" | "authenticated";
  account?: "active" | "restricted" | "suspended";
  handbook?: "accepted" | "required" | "unavailable";
  open: boolean;
};

export type WorkshopAccess =
  "signed-out" | "unavailable" | "onboarding" | "blocked" | "member" | "closed";

export function workshopAccess(input: WorkshopAccessInput): WorkshopAccess {
  if (input.auth === "signed-out" || input.auth === "unconfigured")
    return "signed-out";
  if (input.auth === "profile-unavailable") return "unavailable";
  if (input.account !== "active") return "blocked";
  if (input.handbook === "required") return "onboarding";
  if (input.handbook !== "accepted") return "unavailable";
  return input.open ? "member" : "closed";
}

export function privateWorkshopAllowed(access: WorkshopAccess) {
  return access === "member" || access === "closed";
}
