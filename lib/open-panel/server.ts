import { serverClient } from "../supabase/server";
import {
  canModerate,
  publishedCredits,
  type Addition,
  type PanelData,
  type Revision,
  type PanelCitation,
} from "./domain";
import { HttpError } from "./errors";
import { requireHandbook } from "../handbook/server";
export { HttpError } from "./errors";
export async function communityIdentity(
  moderator = false,
  returnTo: unknown = "/",
) {
  const context = await identity(moderator);
  await requireHandbook(context.db, context.user.id, returnTo);
  return context;
}
export async function identity(moderator = false) {
  const db = await serverClient();
  if (!db)
    throw new HttpError(503, "Open Panel needs Supabase setup. See README.");
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new HttpError(
      401,
      "Your session has expired or you are signed out. Sign in to enter the Workshop.",
    );
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,display_name,role,account_status")
    .eq("id", user.id)
    .single();
  if (profileError || !profile)
    throw new HttpError(
      503,
      "Your profile is unavailable. Check the Open Panel migration.",
    );
  if (moderator && !canModerate(profile.role))
    throw new HttpError(403, "Moderator or administrator access is required.");
  if (profile.account_status !== "active")
    throw new HttpError(
      403,
      profile.account_status === "suspended"
        ? "Workshop access is suspended. Contact the editorial team to request help or an appeal."
        : "Workshop access is currently restricted. Contact the editorial team for help or an appeal.",
    );
  return { db, user, profile };
}
export async function publicPanel(
  slug: string,
): Promise<{ data: PanelData | null; message: string | null }> {
  const db = await serverClient();
  if (!db)
    return {
      data: null,
      message:
        "Open Panel is awaiting Supabase setup. The Published Panel remains available.",
    };
  try {
    const { data: feature, error } = await db
      .from("features")
      .select("id,title,slug,current_revision,updated_at")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (!feature)
      return {
        data: null,
        message: "Open Panel has not been enabled for this feature yet.",
      };
    const [a, r, citations] = await Promise.all([
      db
        .from("published_additions")
        .select("*")
        .eq("feature_id", feature.id)
        .order("display_order"),
      db
        .from("revisions")
        .select("*")
        .eq("feature_id", feature.id)
        .order("revision_number", { ascending: false }),
      db.from("panel_citations").select("*").eq("feature_id", feature.id),
    ]);
    if (a.error || r.error) throw a.error || r.error;
    const ids = [...new Set((a.data ?? []).map((row) => row.contributor_id))];
    const profiles = ids.length
      ? await db.from("public_profiles").select("id,display_name").in("id", ids)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const additions: Addition[] = (a.data ?? []).map((row) => ({
      ...row,
      contributor: profiles.data?.find((p) => p.id === row.contributor_id),
    }));
    return {
      data: {
        feature,
        additions,
        revisions: r.data as Revision[],
        credits: publishedCredits(additions),
        citations: (citations.error ? [] : citations.data) as PanelCitation[],
      },
      message: null,
    };
  } catch {
    return {
      data: null,
      message:
        "Open Panel is temporarily unavailable. You can still read the Published Panel; try the Workshop again later.",
    };
  }
}
