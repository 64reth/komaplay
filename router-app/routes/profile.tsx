import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/profile";
import { Masthead } from "../components/Masthead";
import { PanelDirectory, type PanelDirectoryRow } from "../components/PanelDirectory";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { myPanelsStatusLabel, type EditorialWorkItem } from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";

export const meta: Route.MetaFunction = () => [
  { title: "Profile — KOMA://PLAY" },
  { name: "robots", content: "noindex" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const resolved = await resolveAuth(request);
  if (
    resolved.auth.state === "unconfigured" ||
    resolved.auth.state === "signed-out"
  )
    return data(
      { state: "signed-out" as const },
      { headers: resolved.headers },
    );
  if (
    (resolved.auth.state === "profile-unavailable" || resolved.auth.state === "resolving") ||
    !resolved.client ||
    !resolved.user
  )
    return data(
      { state: "unavailable" as const },
      { headers: resolved.headers },
    );
  const member = resolved.auth.member;
  if (member.accountStatus !== "active")
    return data({ state: member.accountStatus }, { headers: resolved.headers });
  const handbook = await membershipState(resolved.client, resolved.user.id);
  if (handbook.status !== "accepted")
    return data({ state: handbook.status }, { headers: resolved.headers });

  const [profileResult, contributionsResult, capabilities, editorialWork] = await Promise.all([
    resolved.client
      .from("profiles")
      .select("display_name,pen_name,bio,created_at,default_credit")
      .eq("id", resolved.user.id)
      .single(),
    resolved.client
      .from("contributions")
      .select("id,status,feature_id,created_at")
      .eq("author_id", resolved.user.id)
      .order("created_at", { ascending: false }),
    memberCapabilities(resolved.client, member),
    resolved.client.rpc("editorial_my_work"),
  ]);
  if (profileResult.error || contributionsResult.error)
    return data(
      { state: "unavailable" as const },
      { headers: resolved.headers },
    );
  const featureIds = [
    ...new Set((contributionsResult.data ?? []).map((item) => item.feature_id)),
  ];
  const features = featureIds.length
    ? await resolved.client
        .from("features")
        .select("id,title,slug")
        .in("id", featureIds)
    : { data: [], error: null };
  const acceptedIds = (contributionsResult.data ?? [])
    .filter((item) => item.status === "Accepted")
    .map((item) => item.id);
  const citationResult = acceptedIds.length
    ? await resolved.client
        .from("panel_citations")
        .select("id,contribution_id")
        .in("contribution_id", acceptedIds)
    : { data: [], error: null };

  return data(
    {
      state: "accepted" as const,
      profile: profileResult.data,
      capabilities,
      citations: citationResult.error ? 0 : (citationResult.data?.length ?? 0),
      editorialWork: editorialWork.error ? [] : (editorialWork.data ?? []),
      contributions: (contributionsResult.data ?? []).map((item) => ({
        ...item,
        feature:
          features.data?.find((feature) => feature.id === item.feature_id) ??
          null,
      })),
    },
    { headers: resolved.headers },
  );
}

export default function Profile() {
  const result = useLoaderData<typeof loader>();
  if (result.state === "signed-out")
    return (
      <main className="editorial-page">
        <Masthead />
        <SignedOutMemberBoundary
          title="SIGN IN TO VIEW YOUR PROFILE"
          returnTo="/profile"
        />
      </main>
    );
  if (result.state === "restricted" || result.state === "suspended")
    return (
      <main className="editorial-page">
        <Masthead />
        <section className="op-workspace">
          <p className="editorial-marker">MEMBERSHIP ACCESS</p>
          <h1>PROFILE ACCESS IS UNAVAILABLE</h1>
          <p>
            This account cannot use member features. Contact the editorial team
            for help or an appeal.
          </p>
          <Link className="op-button" to="/">
            RETURN TO PUBLICATION
          </Link>
        </section>
      </main>
    );
  if (result.state !== "accepted")
    return (
      <main className="editorial-page">
        <Masthead />
        <section className="op-workspace">
          <p role="status">VERIFYING MEMBERSHIP…</p>
          <Link to="/">RETURN TO PUBLICATION</Link>
        </section>
      </main>
    );

  const published = result.contributions.filter(
    (item) => item.status === "Accepted",
  ).length;
  const panelRows: PanelDirectoryRow[] = [
    ...(result.capabilities.editorial
      ? result.editorialWork.map((item: EditorialWorkItem) => ({
          id: `editorial-${item.feature_id}`,
          title: item.title ?? "Untitled panel",
          type: "Editorial Feature",
          status: myPanelsStatusLabel(item.lifecycle_status),
          date: new Date(item.updated_at).toLocaleDateString("en-GB"),
          meta: item.slug,
          action: <Link to={`/editorial?feature=${item.feature_id}`}>{item.lifecycle_status === "changes_requested" ? "REVISE" : "CONTINUE"} →</Link>,
        }))
      : []),
    ...result.contributions.map((contribution) => ({
      id: `contribution-${contribution.id}`,
      title: contribution.feature?.title ?? "Feature unavailable",
      type: "Open Panel Contribution",
      status: contribution.status,
      date: new Date(contribution.created_at).toLocaleDateString("en-GB"),
      meta: contribution.feature?.slug ?? "",
      action: contribution.feature ? <Link to={`/features/${contribution.feature.slug}/workshop`}>VIEW →</Link> : <span>Unavailable</span>,
    })),
  ];
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace profile-page">
        <p className="op-eyebrow editorial-marker">PANEL IDENTITY</p>
        <h1 tabIndex={-1}>{result.profile.display_name}</h1>
        <nav className="profile-actions" aria-label="Profile actions">
          <Link to="/">← RETURN TO PUBLICATION</Link>
          <Link to="/profile/settings">SETTINGS</Link>
          {result.capabilities.editorial && (
            <Link to="/editorial">EDITORIAL DASHBOARD</Link>
          )}
          {result.capabilities.moderation && (
            <Link to="/cover-editor">COVER EDITOR</Link>
          )}
          {result.capabilities.moderation && (
            <Link to="/moderation">MODERATION</Link>
          )}
        </nav>
        {result.profile.bio && <p>{result.profile.bio}</p>}
        <p>
          Member since{" "}
          {new Date(result.profile.created_at).toLocaleDateString("en-GB")}
        </p>
        <p>Current Pocket Guide accepted.</p>
        <p>
          {published} published contributions · {result.citations} Panel
          Citations
        </p>
        <section id="panels">
          <h2>MY PANELS</h2>
          {!result.capabilities.editorial && <p>Editorial access is granted by moderators.</p>}
          <PanelDirectory label="My Panels" rows={panelRows} empty="No panels yet." />
        </section>
      </div>
    </main>
  );
}
