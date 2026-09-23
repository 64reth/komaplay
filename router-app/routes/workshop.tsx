import { data, Link } from "react-router";
import type { Route } from "./+types/workshop";
import { Masthead } from "../components/Masthead";
import { IssueNavigation } from "../components/IssueNavigation";
import { WorkshopInvitation } from "../components/open-panel/WorkshopInvitation";
import { WorkshopClient } from "../components/open-panel/WorkshopClient";
import { OpenPanelCountdown } from "../components/publication/OpenPanelCountdown";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";
import { catalogue } from "../lib/publication.server";
import { acceptsContributions } from "../lib/publication";
import { workshopAccess, privateWorkshopAllowed } from "../lib/workshop";
import type { Contribution } from "../lib/open-panel";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? `${loaderData.feature.title} Workshop — KOMA://PLAY`
      : "Workshop — KOMA://PLAY",
  },
  { name: "robots", content: "noindex" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const all = await catalogue();
  const feature = all.features.find((item) => item.slug === params.slug);
  if (!feature) throw data("Workshop not found", { status: 404 });
  const issue = all.issues.find((item) => item.id === feature.issue_id)!;
  const publicOpen = acceptsContributions(feature, issue, all.now);
  const resolved = await resolveAuth(request);
  let handbook: "accepted" | "required" | "unavailable" | undefined;
  let access = workshopAccess({ auth: resolved.auth.state, open: publicOpen });
  if (
    resolved.auth.state === "authenticated" &&
    resolved.client &&
    resolved.user
  ) {
    if (resolved.auth.member.accountStatus === "active") {
      handbook = (await membershipState(resolved.client, resolved.user.id))
        .status;
    }
    access = workshopAccess({
      auth: "authenticated",
      account: resolved.auth.member.accountStatus,
      handbook,
      open: publicOpen,
    });
  }
  if (!privateWorkshopAllowed(access) || !resolved.client || !resolved.user) {
    return data(
      {
        feature,
        issue,
        now: all.now,
        access,
        open: false,
        contributions: [],
        defaultCredit: "Display name",
        activity: [],
      },
      { headers: resolved.headers },
    );
  }

  const serverOpen = await resolved.client.rpc(
    "feature_accepts_contributions",
    { target: feature.id },
  );
  const open = publicOpen && !serverOpen.error && serverOpen.data === true;
  access = open ? "member" : "closed";
  const [contributionResult, profileResult, activityResult] = await Promise.all(
    [
      resolved.client
        .from("contributions")
        .select(
          "id,feature_id,author_id,type,target_section,title,body,screenshot_path,media_url,source_url,public_credit,publication_consent,status,moderator_note,incorporated_at,created_at,updated_at",
        )
        .eq("author_id", resolved.user.id)
        .eq("feature_id", feature.id)
        .is("withdrawn_at", null)
        .order("created_at", { ascending: false }),
      resolved.client
        .from("profiles")
        .select("default_credit")
        .eq("id", resolved.user.id)
        .single(),
      resolved.client
        .from("panel_citations")
        .select("public_credit,contribution_type,published_at")
        .eq("feature_id", feature.id)
        .order("published_at", { ascending: false })
        .limit(3),
    ],
  );
  return data(
    {
      feature,
      issue,
      now: all.now,
      access,
      open,
      contributions: contributionResult.error
        ? []
        : (contributionResult.data as Contribution[]),
      defaultCredit: profileResult.error
        ? "Display name"
        : profileResult.data.default_credit,
      activity: activityResult.error ? [] : activityResult.data,
    },
    { headers: resolved.headers },
  );
}

export default function Workshop({ loaderData }: Route.ComponentProps) {
  const { feature, issue, now, access, open } = loaderData;
  return (
    <main className="editorial-page">
      <Masthead slug={feature.slug} />
      <IssueNavigation />
      <div className="op-workspace workshop-page">
        <header className="workshop-header">
          <Link className="workshop-back" to={`/features/${feature.slug}`}>
            ← RETURN TO COMMUNITY EDITION
          </Link>
          <p className="op-eyebrow editorial-marker">OPEN PANEL WORKSHOP</p>
          <h1>{feature.title}</h1>
          <p className="workshop-revision">
            BUILDING REVISION {feature.current_revision + 1} ·{" "}
            <OpenPanelCountdown feature={feature} issue={issue} now={now} />
          </p>
          <p className="workshop-purpose">
            A focused member space to strengthen this editorial with evidence,
            experience and useful corrections.
          </p>
          <nav className="workshop-utilities" aria-label="Workshop utilities">
            <span>MEMBER UTILITIES</span>
            <Link to="/profile">PROFILE</Link>
            <Link to="/handbook">COMMUNITY HANDBOOK</Link>
          </nav>
          <p className="workshop-flow-status" role="status">
            DRAFT · LIVE SOURCE · READY FOR PANEL
          </p>
        </header>
        {access === "signed-out" && (
          <WorkshopInvitation slug={feature.slug} title={feature.title} />
        )}
        {access === "onboarding" && <p role="status">VERIFYING MEMBERSHIP…</p>}
        {access === "unavailable" && (
          <p className="op-notice" role="alert">
            Workshop membership could not be verified. Reading remains
            available.
          </p>
        )}
        {access === "blocked" && (
          <section className="op-notice">
            <h2>WORKSHOP ACCESS IS UNAVAILABLE</h2>
            <p>
              This account cannot use member features. Contact the editorial
              team for help or an appeal.
            </p>
          </section>
        )}
        {(access === "member" || access === "closed") && (
          <>
            <p className="op-notice" role="status">
              {open ? "WORKSHOP ACCESS GRANTED" : "FINAL PANEL · READ ONLY"}
            </p>
            {!open && (
              <p>
                <Link
                  className="op-button"
                  to={`/features/${feature.slug}/correction`}
                >
                  REPORT A PRIVATE CORRECTION →
                </Link>
              </p>
            )}
            <WorkshopClient
              featureId={feature.id}
              featureSlug={feature.slug}
              defaultCredit={loaderData.defaultCredit}
              contributions={loaderData.contributions}
              activity={loaderData.activity}
              readOnly={!open}
            />
          </>
        )}
      </div>
    </main>
  );
}
