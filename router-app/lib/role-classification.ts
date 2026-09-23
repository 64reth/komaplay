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
