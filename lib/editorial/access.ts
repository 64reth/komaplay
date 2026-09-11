export type EditorialProfile = {
  role: string;
  account_status: string;
};
export type EditorialGrant = {
  access_level: string;
  revoked_at: string | null;
};

/** Pure capability rule shared by Profile and the protected Dashboard route. */
export function hasEditorialCapability(
  profile: EditorialProfile,
  grants: EditorialGrant[] | null | undefined,
) {
  if (profile.account_status !== "active") return false;
  if (profile.role === "admin") return true;
  return Boolean(
    grants?.some(
      (grant) =>
        grant.revoked_at === null &&
        ["editor", "administrator"].includes(grant.access_level),
    ),
  );
}

type EditorialGrantQuery = {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): PromiseLike<{ data: EditorialGrant[] | null; error: unknown }>;
  };
};
type EditorialDatabase = {
  from(table: "editorial_access_grants"): EditorialGrantQuery;
};

export async function resolveEditorialCapability(
  db: unknown,
  profile: EditorialProfile,
  userId: string,
) {
  if (profile.account_status !== "active") return false;
  if (profile.role === "admin") return true;
  const grants = await (db as EditorialDatabase)
    .from("editorial_access_grants")
    .select("access_level,revoked_at")
    .eq("user_id", userId);
  if (grants.error) throw grants.error;
  return hasEditorialCapability(profile, grants.data);
}
