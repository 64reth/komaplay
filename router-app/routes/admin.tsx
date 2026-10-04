import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/admin";
import { Masthead } from "../components/Masthead";
import { resolveAuth } from "../lib/auth";
import { editorialContributor, keyRingAccess, legacyEditorialReviewer, rolePresentation, type SiteRole } from "../lib/role-classification";
import { KeyRingBadge } from "../components/KeyRingBadge";

type MemberRow = {
  user_id: string; email: string | null; display_name: string; role: string;
  account_status: string; joined_at: string; editorial_access: boolean;
  legacy_review_grant: boolean; total_count: number;
};

function adminContext(request: Request) {
  return resolveAuth(request);
}

export async function loader({ request }: Route.LoaderArgs) {
  const resolved = await adminContext(request);
  if (resolved.auth.state !== "authenticated" || !resolved.client)
    return data({ state: "signed-out" as const, members: [] as MemberRow[], total: 0 }, { headers: resolved.headers });
  if (resolved.auth.member.role !== "admin" || resolved.auth.member.accountStatus !== "active")
    return data({ state: "denied" as const, members: [] as MemberRow[], total: 0 }, { status: 403, headers: resolved.headers });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const params = {
    search_term: url.searchParams.get("q") ?? "",
    role_filter: url.searchParams.get("role") ?? "all",
    status_filter: url.searchParams.get("status") ?? "all",
    sort_order: url.searchParams.get("sort") ?? "newest",
    page_limit: 25, page_offset: (page - 1) * 25,
  };
  const result = await resolved.client.rpc("admin_member_directory", params);
  if (result.error)
    return data({ state: "unavailable" as const, members: [] as MemberRow[], total: 0 }, { status: 503, headers: resolved.headers });
  const members = (result.data ?? []) as MemberRow[];
  const closeState=await resolved.client.rpc("issue_close_preview");
  return data({ state: "accepted" as const, closure:closeState.error?null:closeState.data, members, total: Number(members[0]?.total_count ?? 0), page, params }, { headers: resolved.headers });
}

export async function action({ request }: Route.ActionArgs) {
  const resolved = await adminContext(request);
  if (resolved.auth.state !== "authenticated" || !resolved.client || resolved.auth.member.role !== "admin" || resolved.auth.member.accountStatus !== "active")
    return data({ error: "Administrator access is required." }, { status: 403, headers: resolved.headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return data({ error: "Same-origin request required." }, { status: 403, headers: resolved.headers });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "setAccess") {
      const level = String(form.get("accessLevel") ?? "");
      if (!["member", "editor", "moderator", "admin"].includes(level))
        return data({ error: "Choose a valid access level." }, { status: 400, headers: resolved.headers });
      const result = await resolved.client.rpc("set_member_access_level", { target: String(form.get("userId") ?? ""), desired_access: level, confirmed: form.get("confirmed") === "yes" });
      if (result.error) throw result.error;
      return data({ success: "Member access updated." }, { headers: resolved.headers });
    }
    return data({ error: "Unknown admin action." }, { status: 400, headers: resolved.headers });
  } catch {
    return data({ error: "The permission change was not applied. Check the account and your admin access." }, { status: 400, headers: resolved.headers });
  }
}

export default function AdminDashboard() {
  const result = useLoaderData<typeof loader>();
  const feedback = useActionData<typeof action>();
  const navigation = useNavigation();
  if (result.state !== "accepted") return <main className="editorial-page"><Masthead/><section className="op-workspace admin-denied"><p className="editorial-marker">ADMINISTRATION</p><h1>{result.state === "signed-out" ? "Sign in to continue." : result.state === "unavailable" ? "The admin directory is temporarily unavailable." : "Admin access is restricted."}</h1><p>{result.state === "signed-out" ? "Use the account menu to sign in." : result.state === "unavailable" ? "Your admin access is intact. Please retry shortly; no permission changes have been made." : "Only active owner/admin accounts can manage user permissions. Moderator access does not include user management."}</p><Link to="/">RETURN TO PUBLICATION →</Link></section></main>;
  const query = result.params.search_term;
  return <main className="editorial-page"><Masthead/><section className="op-workspace admin-dashboard">
    <p className="editorial-marker">ADMINISTRATION · USER ACCESS</p><h1>Member permissions</h1>
    <section aria-label="Issue closure"><h2>Issue: {result.closure?.issueTitle??"Unavailable"} · {result.closure?.lifecycle_state??"Unavailable"}</h2><p>{result.closure?.reason??"Issue closure state could not be loaded. Refresh to retry."}</p><Link to={result.closure?.issueId?`/cover-editor?issue=${result.closure.issueId}`:"/cover-editor"}>VIEW ISSUE / RETRY CLOSE →</Link></section>
    <div className="admin-role-guide"><h2>Access levels</h2><dl><div><dt><KeyRingBadge access={keyRingAccess("member")}/>Member</dt><dd>{rolePresentation.member.description}</dd></div><div><dt><KeyRingBadge access={keyRingAccess("member",true)}/>{editorialContributor.label}</dt><dd>{editorialContributor.description}</dd></div><div><dt><KeyRingBadge access={keyRingAccess("moderator")}/>Moderator</dt><dd>{rolePresentation.moderator.description}</dd></div><div><dt><KeyRingBadge access={keyRingAccess("admin")}/>Admin</dt><dd>{rolePresentation.admin.description}</dd></div></dl><p>Key-rings show operational access, not status. Publisher and Owner are not separate roles in the current system. Publishing is bundled into Moderator; Admin is the highest access level.</p></div>
    {feedback && "error" in feedback && <p role="alert" className="form-error">{feedback.error}</p>}{feedback && "success" in feedback && <p role="status" className="form-success">{feedback.success}</p>}
    <Form method="get" className="admin-toolbar">
      <label>Search<input name="q" defaultValue={query} placeholder="Name, email or user ID"/></label>
      <label>Access<select name="role" defaultValue={result.params.role_filter}><option value="all">All access levels</option><option value="editor">Editorial Contributors</option><option value="moderator">Moderators</option><option value="admin">Admins</option><option value="member">Members</option><option value="missing-profile">Missing display name</option></select></label>
      <label>Status<select name="status" defaultValue={result.params.status_filter}><option value="all">All states</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option></select></label>
      <label>Sort<select name="sort" defaultValue={result.params.sort_order}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="role">Role</option></select></label><button className="op-button action-primary">FILTER →</button>
    </Form>
    <p>{result.total} matching member{result.total === 1 ? "" : "s"}</p>
    <div className="admin-member-list">{result.members.length === 0 ? <p>No members match these filters.</p> : result.members.map(member => <article className="admin-member" key={member.user_id}>
      <header><div><h2>{member.display_name || "Profile name missing"}</h2><p>{member.email ?? member.user_id}</p></div><div className="admin-badges"><KeyRingBadge access={keyRingAccess(member.role as SiteRole,member.editorial_access,member.legacy_review_grant)}/><span>{member.account_status}</span><span>{member.role==="contributor"?"Member":rolePresentation[member.role as SiteRole]?.label ?? member.role}</span>{member.editorial_access && <span>{editorialContributor.label}</span>}{member.legacy_review_grant && <span>{legacyEditorialReviewer.label}</span>}</div></header>
      <p>Joined {new Date(member.joined_at).toLocaleDateString("en-GB")}</p>
      <div className="admin-actions"><Form method="post" className="admin-role-form"><input type="hidden" name="intent" value="setAccess"/><input type="hidden" name="userId" value={member.user_id}/><label>Access level<select key={`${member.role}-${member.editorial_access}-${member.legacy_review_grant}`} name="accessLevel" defaultValue={member.role==="admin"||member.role==="moderator"?member.role:member.editorial_access||member.legacy_review_grant?"editor":"member"}><option value="member">Member</option><option value="editor">Editorial Contributor</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label><label className="admin-confirm"><input type="checkbox" name="confirmed" value="yes"/> Confirm elevated access</label><button disabled={navigation.state !== "idle"} className="op-button">UPDATE ACCESS</button><p className="field-help">Member removes editorial grants and elevated roles. Editorial Contributor removes moderation, administration and legacy review authority. Authored work is retained. Ask another Admin to change your own access.</p></Form></div>
    </article>)}</div>
    <nav className="admin-pagination">{result.page > 1 && <Link to={`?q=${encodeURIComponent(query)}&role=${result.params.role_filter}&status=${result.params.status_filter}&sort=${result.params.sort_order}&page=${result.page-1}`}>← PREVIOUS</Link>}{result.page * 25 < result.total && <Link to={`?q=${encodeURIComponent(query)}&role=${result.params.role_filter}&status=${result.params.status_filter}&sort=${result.params.sort_order}&page=${result.page+1}`}>NEXT →</Link>}</nav>
  </section></main>;
}
