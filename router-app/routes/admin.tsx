import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/admin";
import { Masthead } from "../components/Masthead";
import { resolveAuth } from "../lib/auth";

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
  return data({ state: "accepted" as const, members, total: Number(members[0]?.total_count ?? 0), page, params }, { headers: resolved.headers });
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
    if (intent === "grantEditor" || intent === "revokeEditor") {
      const result = await resolved.client.rpc("manage_editorial_grant", {
        target_email: String(form.get("email") ?? ""), grant_access: intent === "grantEditor",
        grant_reason: String(form.get("reason") ?? "Admin dashboard permission change"),
      });
      if (result.error) throw result.error;
      return data({ success: intent === "grantEditor" ? "Editorial access granted." : "Editorial access revoked." }, { headers: resolved.headers });
    }
    if (intent === "setRole") {
      const role = String(form.get("role") ?? "");
      if (!["member", "contributor", "moderator", "admin"].includes(role))
        return data({ error: "Choose a valid site role." }, { status: 400, headers: resolved.headers });
      if (["moderator", "admin"].includes(role) && form.get("confirmed") !== "yes")
        return data({ error: "Confirm this high-impact permission change." }, { status: 400, headers: resolved.headers });
      const result = await resolved.client.rpc("grant_open_panel_role", { target: String(form.get("userId") ?? ""), new_role: role });
      if (result.error) throw result.error;
      return data({ success: `Site role changed to ${role}.` }, { headers: resolved.headers });
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
    <p>Editors can create panels. Moderators can review other people’s submissions and publish approved work, but cannot approve their own work. Admins inherit all tools and can manage permissions.</p>
    {feedback && "error" in feedback && <p role="alert" className="form-error">{feedback.error}</p>}{feedback && "success" in feedback && <p role="status" className="form-success">{feedback.success}</p>}
    <Form method="get" className="admin-toolbar">
      <label>Search<input name="q" defaultValue={query} placeholder="Name, email or user ID"/></label>
      <label>Access<select name="role" defaultValue={result.params.role_filter}><option value="all">All roles</option><option value="editor">Editorial access</option><option value="moderator">Moderators</option><option value="admin">Admins</option><option value="member">Members</option><option value="missing-profile">Missing display name</option></select></label>
      <label>Status<select name="status" defaultValue={result.params.status_filter}><option value="all">All states</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option></select></label>
      <label>Sort<select name="sort" defaultValue={result.params.sort_order}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option><option value="role">Role</option></select></label><button className="op-button action-primary">FILTER →</button>
    </Form>
    <p>{result.total} matching member{result.total === 1 ? "" : "s"}</p>
    <div className="admin-member-list">{result.members.length === 0 ? <p>No members match these filters.</p> : result.members.map(member => <article className="admin-member" key={member.user_id}>
      <header><div><h2>{member.display_name || "Profile name missing"}</h2><p>{member.email ?? member.user_id}</p></div><div className="admin-badges"><span>{member.account_status}</span><span>{member.role}</span>{member.editorial_access && <span>editor</span>}{member.legacy_review_grant && <span>legacy reviewer</span>}</div></header>
      <p>Joined {new Date(member.joined_at).toLocaleDateString("en-GB")}</p>
      <div className="admin-actions"><Form method="post"><input type="hidden" name="email" value={member.email ?? ""}/><input type="hidden" name="intent" value={member.editorial_access ? "revokeEditor" : "grantEditor"}/><button disabled={navigation.state !== "idle" || !member.email} className="op-button">{member.editorial_access ? "REVOKE EDITOR" : "GRANT EDITOR"}</button></Form>
      <Form method="post" className="admin-role-form"><input type="hidden" name="intent" value="setRole"/><input type="hidden" name="userId" value={member.user_id}/><label>Site role<select name="role" defaultValue={member.role}><option value="member">Member</option><option value="contributor">Contributor</option><option value="moderator">Moderator / reviewer / publisher</option><option value="admin">Admin / owner</option></select></label><label className="admin-confirm"><input type="checkbox" name="confirmed" value="yes"/> Confirm elevated access</label><button disabled={navigation.state !== "idle"} className="op-button">UPDATE ROLE</button></Form></div>
    </article>)}</div>
    <nav className="admin-pagination">{result.page > 1 && <Link to={`?q=${encodeURIComponent(query)}&role=${result.params.role_filter}&status=${result.params.status_filter}&sort=${result.params.sort_order}&page=${result.page-1}`}>← PREVIOUS</Link>}{result.page * 25 < result.total && <Link to={`?q=${encodeURIComponent(query)}&role=${result.params.role_filter}&status=${result.params.status_filter}&sort=${result.params.sort_order}&page=${result.page+1}`}>NEXT →</Link>}</nav>
  </section></main>;
}
