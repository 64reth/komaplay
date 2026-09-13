import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandbookState, HandbookVersion } from "./handbook";
import { needsOnboarding } from "./handbook";
import type { PublicMember } from "./auth";

const versionColumns =
  "id,identifier,label,content,content_hash,acceptance_statement,statement_version,published_at,active,created_at,updated_at";

export async function membershipState(
  db: SupabaseClient,
  userId: string,
): Promise<HandbookState> {
  try {
    const versionResult = await db
      .from("handbook_versions")
      .select(versionColumns)
      .eq("active", true)
      .maybeSingle();
    if (versionResult.error) throw versionResult.error;
    if (!versionResult.data)
      return {
        status: "unavailable",
        version: null,
        acceptance: null,
        message:
          "No active Pocket Guide is available. Membership features remain paused.",
      };

    const version = {
      ...versionResult.data,
      created_by: null,
    } as HandbookVersion;
    const acceptanceResult = await db
      .from("handbook_acceptances")
      .select("user_id,handbook_version_id,accepted_at,statement_version")
      .eq("user_id", userId)
      .eq("handbook_version_id", version.id)
      .maybeSingle();
    if (acceptanceResult.error) throw acceptanceResult.error;

    let compatible = false;
    if (!acceptanceResult.data) {
      const compatibility = await db.rpc("has_current_handbook_acceptance");
      if (compatibility.error) throw compatibility.error;
      compatible = compatibility.data === true;
    }
    return {
      status:
        needsOnboarding(version, acceptanceResult.data) && !compatible
          ? "required"
          : "accepted",
      version,
      acceptance: acceptanceResult.data,
    };
  } catch {
    return {
      status: "unavailable",
      version: null,
      acceptance: null,
      message:
        "The Pocket Guide could not be verified. Reading remains available while member features are paused.",
    };
  }
}

export async function memberCapabilities(
  db: SupabaseClient,
  member: PublicMember,
) {
  if (member.accountStatus !== "active")
    return { editorial: false, moderation: false };
  const roleModeration = member.role === "moderator" || member.role === "admin";
  if (member.role === "admin") return { editorial: true, moderation: true };
  const result = await db
    .from("editorial_access_grants")
    .select("id,access_level,revoked_at")
    .eq("user_id", member.id)
    .is("revoked_at", null);
  const activeGrants = result.error ? [] : result.data ?? [];
  const editorial = activeGrants.length > 0;
  const grantModeration = activeGrants.some((grant) => grant.access_level === "administrator");
  return { editorial: editorial || roleModeration, moderation: roleModeration || grantModeration };
}
