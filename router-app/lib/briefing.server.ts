import { resolveAuth } from "./auth";
import { membershipState } from "./membership.server";
import { broadInterests } from "./preferences";
import type { InboxEvent } from "./inbox";
export async function personalBriefing(request: Request) {
  const r = await resolveAuth(request);
  r.headers.set("Cache-Control", "private, no-store");
  r.headers.set("Vary", "Cookie");
  if (
    r.auth.state !== "authenticated" ||
    r.auth.member.accountStatus !== "active" ||
    !r.client ||
    !r.user
  )
    return { headers: r.headers, briefing: null };
  if ((await membershipState(r.client, r.user.id)).status !== "accepted")
    return { headers: r.headers, briefing: null };
  const [profile, drafts, saved, inbox, work] = await Promise.all([
    r.client
      .from("profiles")
      .select("interests,preferences_chosen_at")
      .eq("id", r.user.id)
      .single(),
    r.client
      .from("workshop_drafts")
      .select("id,feature_id,payload")
      .eq("user_id", r.user.id)
      .is("submitted_contribution_id", null)
      .order("updated_at", { ascending: false })
      .limit(2),
    r.client
      .from("saved_features")
      .select("feature_id")
      .eq("user_id", r.user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    r.client.rpc("my_editorial_inbox"),
    r.client.rpc("editorial_my_work"),
  ]);
  return {
    headers: r.headers,
    briefing: {
      preferences: broadInterests(profile.data?.interests),
      chosen: !!profile.data?.preferences_chosen_at,
      drafts: (drafts.data ?? []).map((d) => ({
        id: d.id,
        feature_id: d.feature_id,
        title: String(d.payload?.title || "Untitled writing"),
      })),
      saved: saved.data ?? [],
      unread: ((inbox.data ?? []) as InboxEvent[]).filter((e) => !e.read_at)
        .length,
      events: ((inbox.data ?? []) as InboxEvent[])
        .filter((e) => !e.read_at)
        .slice(0, 2),
      editorial: (
        (work.data ?? []) as { feature_id: string; title: string }[]
      ).slice(0, 2),
      unavailable: !!(
        profile.error ||
        drafts.error ||
        saved.error ||
        inbox.error
      ),
    },
  };
}
