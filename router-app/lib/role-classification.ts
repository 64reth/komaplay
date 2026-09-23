export type SiteRole = "member" | "contributor" | "moderator" | "admin";

export const rolePresentation: Record<SiteRole, { label: string; description: string }> = {
  member: { label: "Member", description: "Can join KOMA and submit Open Panel contributions." },
  contributor: { label: "Member (legacy contributor)", description: "A legacy community classification with the same tool access as Member. Editorial access is granted separately." },
  moderator: { label: "Moderator", description: "Can create panels, review other people’s submissions, moderate Open Panel contributions, and publish approved panels. Cannot approve their own work." },
  admin: { label: "Admin", description: "Can manage users and site operations, and inherits editorial, moderation, review, and publishing tools. Cannot approve their own work." },
};

export const editorialContributor = {
  label: "Editorial Contributor",
  description: "Can access the Editorial Dashboard and create and submit canonical panels.",
};

export const legacyEditorialReviewer = {
  label: "Legacy editorial reviewer/publisher",
  description: "An older editorial grant with canonical review and publishing access. It is not Admin access or Open Panel moderation.",
};

export function accessFor(role: SiteRole, editor = false, legacyReviewer = false) {
  const operational = role === "moderator" || role === "admin";
  return {
    workshop: true,
    editorial: editor || legacyReviewer || operational,
    canonicalReview: legacyReviewer || operational,
    canonicalPublish: legacyReviewer || operational,
    openPanelModeration: operational,
    admin: role === "admin",
  };
}

export type KeyRingAccess = {
  badge: "member" | "editorial-contributor" | "moderator" | "admin";
  tooltip: string;
};

export function keyRingAccess(role: SiteRole, editor = false, legacyReviewer = false): KeyRingAccess {
  if (role === "admin") return { badge: "admin", tooltip: "Admin: Can manage users and site operations" };
  if (role === "moderator") return { badge: "moderator", tooltip: "Moderator: Can review, publish, and moderate" };
  if (legacyReviewer) return { badge: "moderator", tooltip: "Legacy editorial access: Can review and publish canonical panels" };
  if (editor) return { badge: "editorial-contributor", tooltip: "Editorial Contributor: Can create and submit panels" };
  return { badge: "member", tooltip: "Member: Workshop access" };
}
