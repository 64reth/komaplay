import {contributionState} from "../lib/contribution-state";
import {SaveFeature} from "../components/SaveFeature";
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
  resolved.headers.set("Cache-Control","private, no-store");
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
      .select("id,status,feature_id,created_at,incorporated_at")
      .is("withdrawn_at",null)
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
  const [draftResult,savedResult,states]=await Promise.all([
    resolved.client.from("workshop_drafts").select("id,feature_id,payload,updated_at").eq("user_id",resolved.user.id).is("submitted_contribution_id",null).order("updated_at",{ascending:false}),
    resolved.client.from("saved_features").select("feature_id,created_at").eq("user_id",resolved.user.id).order("created_at",{ascending:false}),
    resolved.client.rpc("my_contribution_publication"),
  ]);
  if(draftResult.error||savedResult.error||states.error||(capabilities.editorial&&editorialWork.error))return data({state:"unavailable" as const},{headers:resolved.headers});
  const featureIds=[...new Set([...(contributionsResult.data??[]).map(c=>c.feature_id),...(draftResult.data??[]).map(d=>d.feature_id),...(savedResult.data??[]).map(s=>s.feature_id)])];
  const features=featureIds.length?await resolved.client.from("public_features").select("id,title,slug").in("id",featureIds):{data:[],error:null};
  if(features.error)return data({state:"unavailable" as const},{headers:resolved.headers});
  const publication=states.data as {contribution_id:string;published:boolean;cited:boolean}[];
  return data(
    {
      state: "accepted" as const,
      profile: profileResult.data,
      capabilities,
      publication,
      drafts:(draftResult.data??[]).map(d=>({...d,feature:features.data?.find(f=>f.id===d.feature_id)??null})),
      saved:(savedResult.data??[]).map(s=>({...s,feature:features.data?.find(f=>f.id===s.feature_id)??null})),
      citations:publication.filter(p=>p.published&&p.cited).length,
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
          <p role="status">{result.state==="unavailable"?"Your workspace could not be loaded. Please retry; your saved work is retained.":"VERIFYING MEMBERSHIP…"}</p>
          <Link to="/">RETURN TO PUBLICATION</Link>
        </section>
      </main>
    );

  const published = result.publication.filter(p=>p.published).length;
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
      status: contributionState(contribution,result.publication.find(p=>p.contribution_id===contribution.id)?.published,result.publication.find(p=>p.contribution_id===contribution.id)?.cited),
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
        {result.drafts.length>0&&<section><h2>WORKSHOP DRAFTS</h2>{result.drafts.map(d=><div key={d.id}>{String(d.payload.title||"Untitled proposal")} · {d.feature?<Link to={`/features/${d.feature.slug}/workshop?draft=${d.id}`}>CONTINUE →</Link>:<details><summary>Panel unavailable · recover your writing</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{String(d.payload.body||"")}</pre></details>}</div>)}</section>}
        {result.contributions.some(c=>c.status==="Changes Requested")&&<section><h2>NEEDS YOUR ATTENTION</h2>{result.contributions.filter(c=>c.status==="Changes Requested").map(c=><p key={c.id}>{c.feature?<Link to={`/features/${c.feature.slug}/workshop`}>{c.feature.title} · REVISE →</Link>:"Panel unavailable"}</p>)}</section>}
        <section><h2>SAVED</h2>{result.saved.length?result.saved.map(s=><p key={s.feature_id}>{s.feature?<Link to={`/features/${s.feature.slug}`}>{s.feature.title}</Link>:"This saved panel is no longer available."} <SaveFeature feature={s.feature_id}/></p>):<p>No saved panels yet. Use Save on a published panel.</p>}</section>
        <section id="panels">
          <h2>YOUR CONTRIBUTIONS</h2>

          <PanelDirectory label="My Panels" rows={panelRows} empty="No panels yet." />
        </section>
      </div>
    </main>
  );
}

export const headers:Route.HeadersFunction=({loaderHeaders,actionHeaders})=>{const h=new Headers(loaderHeaders);actionHeaders.forEach((v,k)=>h.set(k,v));h.set("Cache-Control","private, no-store");h.set("Vary","Cookie");return h;};
