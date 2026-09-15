export type MembershipAccess =
  | "public"
  | "required"
  | "accepted"
  | "restricted"
  | "suspended"
  | "unavailable";

export function membershipAccess(
  auth: "unconfigured" | "signed-out" | "profile-unavailable" | "resolving" | "authenticated",
  accountStatus?: "active" | "restricted" | "suspended",
  handbookStatus?: "required" | "accepted" | "unavailable",
): MembershipAccess {
  if (auth === "unconfigured" || auth === "signed-out") return "public";
  if (auth === "profile-unavailable" || auth === "resolving") return "unavailable";
  if (accountStatus === "restricted" || accountStatus === "suspended")
    return accountStatus;
  return handbookStatus ?? "unavailable";
}

export const mayLoadMemberData = (access: MembershipAccess) =>
  access === "accepted";
