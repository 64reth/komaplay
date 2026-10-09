import { MarkdownText } from "../components/MarkdownText";
import { catalogue } from "../lib/publication.server";
import { broadInterests } from "../lib/preferences";
import { acceptsContributions } from "../lib/publication";
import { MyKeyRing } from "../components/KeyRingBadge";
import type { InboxEvent } from "../lib/inbox";
import { contributionState } from "../lib/contribution-state";
import { SaveFeature } from "../components/SaveFeature";
import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/profile";
import { Masthead } from "../components/Masthead";
import {
  PanelDirectory,
  type PanelDirectoryRow,
} from "../components/PanelDirectory";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import {
  myPanelsStatusLabel,
  type EditorialWorkItem,
} from "../lib/editorial-alpha";
import { memberCapabilities, membershipState } from "../lib/membership.server";

export const meta: Route.MetaFunction = () => [
  { title: "Profile — KOMA://PLAY" },
  { name: "robots", content: "noindex" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const resolved = await resolveAuth(request);
  resolved.headers.set("Cache-Control", "private, no-store");
  if (
    resolved.auth.state === "unconfigured" ||
    resolved.auth.state === "signed-out"
  )
    return data(
      { state: "signed-out" as const },
      { headers: resolved.headers },
    );
  if (
    resolved.auth.state === "profile-unavailable" ||
    resolved.auth.state === "resolving" ||
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

  const [profileResult, contributionsResult, capabilities, editorialWork] =
    await Promise.all([
      resolved.client
        .from("profiles")
        .select(
          "display_name,pen_name,bio,created_at,default_credit,interests,preferences_chosen_at",
        )
        .eq("id", resolved.user.id)
        .single(),
      resolved.client
        .from("contributions")
        .select(
          "id,title,body,moderator_note,status,feature_id,created_at,incorporated_at",
        )
        .is("withdrawn_at", null)
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
  const [draftResult, savedResult, states, inbox, authored, citationHistory] =
    await Promise.all([
      resolved.client
        .from("workshop_drafts")
        .select("id,feature_id,payload,updated_at")
        .eq("user_id", resolved.user.id)
        .is("submitted_contribution_id", null)
        .order("updated_at", { ascending: false }),
      resolved.client
        .from("saved_features")
        .select("feature_id,created_at")
        .eq("user_id", resolved.user.id)
        .order("created_at", { ascending: false }),
      resolved.client.rpc("my_contribution_publication"),
      resolved.client.rpc("my_editorial_inbox"),
      resolved.client.rpc("my_editorial_publications"),
      resolved.client.rpc("my_citation_history"),
    ]);
  if (
    draftResult.error ||
    savedResult.error ||
    states.error ||
    (capabilities.editorial && editorialWork.error)
  )
    return data(
      { state: "unavailable" as const },
      { headers: resolved.headers },
    );
  const featureIds = [
    ...new Set([
      ...(contributionsResult.data ?? []).map((c) => c.feature_id),
      ...(draftResult.data ?? []).map((d) => d.feature_id),
      ...(savedResult.data ?? []).map((s) => s.feature_id),
      ...(inbox.data ?? []).map((e: InboxEvent) => e.feature_id),
      ...(authored.data ?? []).map((e: { feature_id: string }) => e.feature_id),
    ]),
  ];
  const features = featureIds.length
    ? await resolved.client
        .from("public_features")
        .select("id,title,slug,issue_id")
        .in("id", featureIds)
    : { data: [], error: null };
  if (features.error)
    return data(
      { state: "unavailable" as const },
      { headers: resolved.headers },
    );
  const issues = await resolved.client
    .from("public_issues")
    .select("id,title,slug");
  const discovery = await catalogue();
  const interests = broadInterests(profileResult.data.interests);
  const nextPanels = discovery.features
    .filter((f) => {
      const i = discovery.issues.find((i) => i.id === f.issue_id);
      return i && acceptsContributions(f, i, discovery.now);
    })
    .sort(
      (a, b) =>
        Number(
          interests.some((p) =>
            discovery.categories.some(
              (c) => c.id === b.category_id && c.slug === p,
            ),
          ),
        ) -
        Number(
          interests.some((p) =>
            discovery.categories.some(
              (c) => c.id === a.category_id && c.slug === p,
            ),
          ),
        ),
    )
    .slice(0, 3);
  const publication = states.data as {
    contribution_id: string;
    published: boolean;
    cited: boolean;
  }[];
  return data(
    {
      state: "accepted" as const,
      profile: profileResult.data,
      capabilities,
      nextPanels,
      inbox: (inbox.data ?? []) as InboxEvent[],
      inboxError: inbox.error
        ? "Inbox could not be loaded. Please retry."
        : undefined,
      features: features.data ?? [],
      issues: issues.data ?? [],
      authored: (authored.data ?? []) as {
        feature_id: string;
        published_at: string;
      }[],
      publication,
      drafts: (draftResult.data ?? []).map((d) => ({
        ...d,
        feature: features.data?.find((f) => f.id === d.feature_id) ?? null,
      })),
      saved: (savedResult.data ?? []).map((s) => ({
        ...s,
        feature: features.data?.find((f) => f.id === s.feature_id) ?? null,
      })),
      citations: (citationHistory.data ?? []).length,
      citationHistory: (citationHistory.data ?? []) as {
        contribution_id: string;
        feature_id: string;
        recognised_at: string;
      }[],
      historyError: !!(citationHistory.error || authored.error || issues.error),
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
          <p role="status">
            {result.state === "unavailable"
              ? "Your workspace could not be loaded. Please retry; your saved work is retained."
              : "VERIFYING MEMBERSHIP…"}
          </p>
          <Link to="/">RETURN TO PUBLICATION</Link>
        </section>
      </main>
    );

  const published = result.publication.filter((p) => p.published).length;
  const panelRows: PanelDirectoryRow[] = [
    ...(result.capabilities.editorial
      ? result.editorialWork.map((item: EditorialWorkItem) => ({
          id: `editorial-${item.feature_id}`,
          title: item.title ?? "Untitled panel",
          type: "Editorial Feature",
          status: myPanelsStatusLabel(item.lifecycle_status),
          date: new Date(item.updated_at).toLocaleDateString("en-GB"),
          meta: item.slug,
          action: (
            <Link to={`/editorial?feature=${item.feature_id}`}>
              {item.lifecycle_status === "changes_requested"
                ? "REVISE"
                : "CONTINUE"}{" "}
              →
            </Link>
          ),
        }))
      : []),
    ...result.contributions.map((contribution) => ({
      id: `contribution-${contribution.id}`,
      title: contribution.title,
      type: "Open Panel Contribution",
      status: contributionState(
        contribution,
        result.publication.find((p) => p.contribution_id === contribution.id)
          ?.published,
        result.publication.find((p) => p.contribution_id === contribution.id)
          ?.cited,
      ),
      date: new Date(contribution.created_at).toLocaleDateString("en-GB"),
      meta:
        contribution.feature?.title ??
        "Panel not currently public · your submission is retained",
      action: contribution.feature ? (
        <Link to={`/features/${contribution.feature.slug}/workshop`}>
          VIEW →
        </Link>
      ) : (
        <a href={`#submission-${contribution.id}`}>VIEW OWN SUBMISSION →</a>
      ),
    })),
  ];
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace profile-page member-hub">
        <p className="op-eyebrow editorial-marker">PANEL IDENTITY</p>
        <h1 tabIndex={-1} className="identity-heading">
          <MyKeyRing profile />
          {result.profile.display_name}
        </h1>
        <p className="field-help">
          Keys reflect trusted access. Citations recognise editorial
          contribution.
        </p>
        <nav className="profile-actions" aria-label="Profile actions">
          <Link to="/">← RETURN TO PUBLICATION</Link>
          <Link to="/profile/settings">SETTINGS</Link>
          <Link to="/profile/inbox">
            My Inbox{result.inbox.some((e) => !e.read_at) ? " · UNREAD" : ""}
          </Link>
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
        {result.drafts.length > 0 && (
          <section>
            <h2>WORKSHOP DRAFTS</h2>
            {result.drafts.map((d) => (
              <div key={d.id}>
                {String(d.payload.title || "Untitled proposal")} ·{" "}
                {d.feature ? (
                  <Link
                    to={`/features/${d.feature.slug}/workshop?draft=${d.id}`}
                  >
                    CONTINUE →
                  </Link>
                ) : (
                  <details>
                    <summary>Panel unavailable · recover your writing</summary>
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {String(d.payload.body || "")}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </section>
        )}
        {result.contributions.some((c) => c.status === "Changes Requested") && (
          <section>
            <h2>NEEDS YOUR ATTENTION</h2>
            {result.contributions
              .filter((c) => c.status === "Changes Requested")
              .map((c) => (
                <p key={c.id}>
                  {c.feature ? (
                    <Link to={`/features/${c.feature.slug}/workshop`}>
                      {c.feature.title} · REVISE →
                    </Link>
                  ) : (
                    "Panel unavailable"
                  )}
                </p>
              ))}
          </section>
        )}
        <section>
          <h2>WHAT NEXT?</h2>
          {result.nextPanels.map((f) => (
            <p key={f.id}>
              <Link to={`/features/${f.slug}`}>{f.title} →</Link>
            </p>
          ))}
          <div className="profile-actions">
            <Link className="hub-action" to="/search?status=open">
              EXPLORE OPEN PANELS →
            </Link>
            <Link className="hub-action" to="/profile/settings">
              EDIT INTERESTS →
            </Link>
          </div>
        </section>
        <section id="saved" className={result.saved.length ? undefined : "profile-empty"}>
          <h2>SAVED</h2>
          {result.saved.length ? (
            result.saved.map((s) => (
              <p key={s.feature_id}>
                {s.feature ? (
                  <Link to={`/features/${s.feature.slug}`}>
                    {s.feature.title}
                  </Link>
                ) : (
                  "This saved panel is no longer available."
                )}{" "}
                <SaveFeature feature={s.feature_id} />
              </p>
            ))
          ) : (
            <p>No saved panels yet. Use Save on a published panel.</p>
          )}
        </section>
        <section className={!result.citationHistory.length && !result.publication.some(p => p.published) && !result.authored.length ? "profile-empty" : undefined}>
          <h2>PUBLICATION & CITATIONS</h2>
          {result.historyError && (
            <p role="status">
              Some history is temporarily unavailable. Please retry.
            </p>
          )}
          {result.citationHistory.map((c) => {
            const f = result.features.find((f) => f.id === c.feature_id);
            return (
              <p key={c.contribution_id}>
                PANEL CITATION ·{" "}
                {f ? (
                  <Link to={`/features/${f.slug}`}>{f.title} →</Link>
                ) : (
                  "Recognised contribution · panel not currently public"
                )}
              </p>
            );
          })}
          {result.publication
            .filter((p) => p.published && !p.cited)
            .map((p) => {
              const c = result.contributions.find(
                  (c) => c.id === p.contribution_id,
                ),
                f = c?.feature;
              return (
                <p key={p.contribution_id}>
                  {p.cited ? "PANEL CITATION" : "PUBLISHED CONTRIBUTION"} ·{" "}
                  {f ? (
                    <Link to={`/features/${f.slug}`}>{f.title} →</Link>
                  ) : (
                    "Panel unavailable"
                  )}
                </p>
              );
            })}
          {result.authored.map((p) => {
            const f = result.features.find((f) => f.id === p.feature_id);
            return f ? (
              <p key={p.feature_id}>
                PUBLISHED PANEL ·{" "}
                <Link to={`/features/${f.slug}`}>{f.title} →</Link>
              </p>
            ) : null;
          })}
          {!result.citationHistory.length &&
            !result.publication.some((p) => p.published) &&
            !result.authored.length && (
              <p>
                Publication and citations will appear here when editorial work
                goes live. Acceptance alone does not count as publication.
              </p>
            )}
          {(result.authored.length > 0 || result.publication.some(p => p.published)) && <h3>ISSUES YOU CONTRIBUTED TO</h3>}
          {result.issues
            .filter((i) =>
              result.features.some(
                (f) =>
                  f.issue_id === i.id &&
                  (result.authored.some((a) => a.feature_id === f.id) ||
                    result.contributions.some(
                      (c) =>
                        c.feature_id === f.id &&
                        result.publication.some(
                          (p) => p.contribution_id === c.id && p.published,
                        ),
                    )),
              ),
            )
            .map((i) => (
              <p key={i.id}>
                <Link to={`/issues/${i.slug}`}>{i.title} →</Link>
              </p>
            ))}
        </section>
        <section className="member-activity">
          <h2>MY INBOX</h2>
          <p className="hub-meta">
            {result.inbox.filter((e) => !e.read_at).length} unread · private
            editorial updates
          </p>
          {result.inboxError && <p role="status">{result.inboxError}</p>}
          {result.inbox.slice(0, 2).map((e) => (
            <p key={e.id}>
              {e.message.length > 160
                ? `${e.message.slice(0, 157)}…`
                : e.message}
            </p>
          ))}
          <Link className="hub-action" to="/profile/inbox">
            VIEW MY INBOX →
          </Link>
        </section>
        {result.contributions
          .filter((c) => !c.feature)
          .map((c) => (
            <details
              className="retained-submission"
              id={`submission-${c.id}`}
              key={c.id}
            >
              <summary>{c.title} · VIEW OWN SUBMISSION</summary>
              <p>
                {contributionState(c)} · Panel not currently public. Your
                submission has been retained.
              </p>
              <MarkdownText text={c.body} />
              {c.moderator_note && (
                <p>Editorial guidance: {c.moderator_note}</p>
              )}
            </details>
          ))}
        <section id="panels" className={panelRows.length ? undefined : "profile-empty"}>
          <h2>YOUR CONTRIBUTIONS</h2>

          <PanelDirectory
            label="Your contributions"
            rows={panelRows}
            empty="No contributions yet."
          />
        </section>

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
