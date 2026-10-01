import { data, Link, useActionData } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/inbox";
import { privateMember } from "../lib/private-member.server";
import { EditorialInbox } from "../components/EditorialInbox";
import { Masthead } from "../components/Masthead";
import { filterInbox, type InboxEvent } from "../lib/inbox";
export const meta: Route.MetaFunction = () => [
  { title: "My Inbox — KOMA://PLAY" },
  { name: "robots", content: "noindex" },
];
export async function loader({ request }: Route.LoaderArgs) {
  const { client, headers } = await privateMember(request);
  headers.set("Vary", "Cookie");
  const result = await client.rpc("my_editorial_inbox");
  const events = (result.data ?? []) as InboxEvent[];
  const ids = [...new Set(events.map((e) => e.feature_id))];
  const features = ids.length
    ? await client.from("public_features").select("id,title,slug").in("id", ids)
    : { data: [], error: null };
  const filter = new URL(request.url).searchParams.get("filter") ?? "all";
  return data(
    {
      events: filterInbox(events, filter),
      unread: events.filter((e) => !e.read_at).length,
      features: features.data ?? [],
      filter,
      error: result.error
        ? "Your Inbox could not be loaded. Please retry."
        : undefined,
    },
    { headers },
  );
}
export async function action({ request }: Route.ActionArgs) {
  const { client, headers } = await privateMember(request);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return data(
      { error: "Same-origin request required" },
      { status: 403, headers },
    );
  const form = await request.formData();
  const parsed = z
    .object({ inboxId: z.string().uuid(), seen: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return data({ error: "Invalid Inbox action" }, { status: 400, headers });
  const r = await client.rpc("set_inbox_read", {
    target: parsed.data.inboxId,
    seen: parsed.data.seen === "true",
  });
  return data(
    {
      error:
        r.error || !r.data
          ? "Inbox could not be updated. Please retry."
          : undefined,
    },
    { status: r.error ? 503 : 200, headers },
  );
}
export default function MyInbox({ loaderData }: Route.ComponentProps) {
  const actionResult = useActionData<typeof action>();
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace member-hub inbox-page">
        <p className="op-eyebrow editorial-marker">PRIVATE EDITORIAL UPDATES</p>
        <h1>My Inbox</h1>
        <Link className="hub-action" to="/profile">
          ← MY PROFILE
        </Link>
        <details className="inbox-controls" open>
          <summary>{loaderData.unread} unread · latest 50 messages</summary>
          <nav className="profile-actions" aria-label="My Inbox filters">
            {["all", "unread", "citations", "editorial"].map((value) => (
              <Link
                key={value}
                aria-current={loaderData.filter === value ? "page" : undefined}
                to={
                  value === "all"
                    ? "/profile/inbox"
                    : `/profile/inbox?filter=${value}`
                }
              >
                {value.toUpperCase()}
              </Link>
            ))}
          </nav>
          <p>
            Meaningful editorial updates only. Read state is private to you.
          </p>
        </details>
        <EditorialInbox
          events={loaderData.events}
          features={loaderData.features}
          error={actionResult?.error ?? loaderData.error}
        />
      </div>
    </main>
  );
}
export const headers: Route.HeadersFunction = ({
  loaderHeaders,
  actionHeaders,
}) => {
  const h = new Headers(loaderHeaders);
  actionHeaders.forEach((v, k) => h.set(k, v));
  h.set("Cache-Control", "private, no-store");
  h.set("Vary", "Cookie");
  return h;
};
