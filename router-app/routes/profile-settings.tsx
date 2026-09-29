import { BroadPreferences } from "../components/BroadPreferences";
import { broadPreferences } from "../lib/preferences";
import { safeReturnPath } from "../lib/handbook";
import { actionFailure } from "../lib/action-feedback";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import type { Route } from "./+types/profile-settings";
import { Masthead } from "../components/Masthead";
import { SignedOutMemberBoundary } from "../components/MemberBoundary";
import { resolveAuth } from "../lib/auth";
import { membershipState } from "../lib/membership.server";

const schema = z.object({
  displayName: z.string().trim().min(1).max(80),
  penName: z.string().trim().max(80),
  bio: z.string().trim().max(280),
  interests: z.array(z.enum(broadPreferences)).max(4),
  defaultCredit: z.enum(["Display name", "Pen name", "Anonymous Panelist"]),
});

async function acceptedContext(request: Request) {
  const resolved = await resolveAuth(request);
  if (
    resolved.auth.state !== "authenticated" ||
    !resolved.client ||
    !resolved.user ||
    resolved.auth.member.accountStatus !== "active"
  )
    return { resolved, accepted: false };
  const handbook = await membershipState(resolved.client, resolved.user.id);
  return { resolved, accepted: handbook.status === "accepted" };
}

export async function loader({ request }: Route.LoaderArgs) {
  const context = await acceptedContext(request);
  const { resolved } = context;
  if (
    resolved.auth.state === "unconfigured" ||
    resolved.auth.state === "signed-out"
  )
    return data(
      { state: "signed-out" as const },
      { headers: resolved.headers },
    );
  if (
    resolved.auth.state === "authenticated" &&
    resolved.auth.member.accountStatus === "restricted"
  )
    return data(
      { state: "restricted" as const },
      { headers: resolved.headers },
    );
  if (
    resolved.auth.state === "authenticated" &&
    resolved.auth.member.accountStatus === "suspended"
  )
    return data({ state: "suspended" as const }, { headers: resolved.headers });
  if (!context.accepted || !resolved.client || !resolved.user)
    return data({ state: "verifying" as const }, { headers: resolved.headers });
  const profile = await resolved.client
    .from("profiles")
    .select(
      "display_name,pen_name,bio,default_credit,preferences_chosen_at,profile_public,history_public,workbench_visible,interests,motion_preference,workshop_density,newsletter_opt_in,status_email_opt_in",
    )
    .eq("id", resolved.user.id)
    .single();
  return profile.error
    ? data({ state: "unavailable" as const }, { headers: resolved.headers })
    : data(
        {
          state: "accepted" as const,
          profile: profile.data,
          welcome: new URL(request.url).searchParams.get("welcome") === "1",
          returnTo: safeReturnPath(
            new URL(request.url).searchParams.get("returnTo"),
            "/",
          ),
        },
        { headers: resolved.headers },
      );
}

export async function action({ request }: Route.ActionArgs) {
  const context = await acceptedContext(request);
  const { resolved } = context;
  if (!context.accepted || !resolved.client || !resolved.user)
    return data(
      { error: "Active membership and Pocket Guide acceptance are required." },
      { status: 403, headers: resolved.headers },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return data(
      { error: "Same-origin request required." },
      { status: 403, headers: resolved.headers },
    );
  try {
    const form = await request.formData();
    if (form.get("intent") === "preferences") {
      const choices =
        form.get("skip") === "true"
          ? []
          : z
              .array(z.enum(broadPreferences))
              .max(4)
              .parse(form.getAll("interests"));
      const saved = await resolved.client.rpc("set_member_preferences", {
        choices,
      });
      if (saved.error) throw saved.error;
      return redirect(safeReturnPath(form.get("returnTo"), "/"), {
        headers: resolved.headers,
      });
    }
    const value = schema.parse({
      interests: form.getAll("interests"),
      displayName: form.get("displayName"),
      penName: form.get("penName") ?? "",
      bio: form.get("bio") ?? "",
      defaultCredit: form.get("defaultCredit"),
    });
    const update = await resolved.client
      .from("profiles")
      .update({
        display_name: value.displayName,
        pen_name: value.penName,
        bio: value.bio,
        default_credit: value.defaultCredit,
      })
      .eq("id", resolved.user.id);
    if (update.error) throw update.error;
    const preferences = await resolved.client.rpc("set_member_preferences", {
      choices: value.interests,
    });
    if (preferences.error) throw preferences.error;
    return redirect("/profile?updated=1", { headers: resolved.headers });
  } catch (error) {
    return data(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((issue) => issue.message).join(" ")
            : actionFailure(
                error,
                "Your changes are still here, but we couldn’t save them just now. Please try again.",
              ),
      },
      { status: 400, headers: resolved.headers },
    );
  }
}

export default function ProfileSettings() {
  const result = useLoaderData<typeof loader>();
  const actionResult = useActionData<typeof action>();
  const navigation = useNavigation();
  if (result.state === "signed-out")
    return (
      <main className="editorial-page">
        <Masthead />
        <SignedOutMemberBoundary
          title="SIGN IN TO EDIT SETTINGS"
          returnTo="/profile/settings"
        />
      </main>
    );
  if (result.state !== "accepted")
    return (
      <main className="editorial-page">
        <Masthead />
        <section className="op-workspace">
          <h1>SETTINGS ARE UNAVAILABLE</h1>
          <p role="alert">
            Membership must be active and verified before settings can be
            changed.
          </p>
          <Link to="/profile">← RETURN TO PROFILE</Link>
          <Link to="/">RETURN TO PUBLICATION</Link>
        </section>
      </main>
    );
  const profile = result.profile;
  if (result.welcome)
    return (
      <main className="editorial-page">
        <Masthead />
        <section className="op-workspace">
          <p className="editorial-marker">WELCOME TO KOMA</p>
          <h1>Find your next panel</h1>
          <Form method="post">
            <input type="hidden" name="intent" value="preferences" />
            <input type="hidden" name="returnTo" value={result.returnTo} />
            <BroadPreferences selected={profile.interests} />
            {actionResult?.error && <p role="alert">{actionResult.error}</p>}
            <button
              className="op-button"
              disabled={navigation.state !== "idle"}
            >
              CONTINUE →
            </button>{" "}
            <button
              className="op-button"
              name="skip"
              value="true"
              disabled={navigation.state !== "idle"}
            >
              SKIP
            </button>
          </Form>
        </section>
      </main>
    );
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace profile-page">
        <nav className="profile-actions" aria-label="Settings actions">
          <Link to="/profile">← RETURN TO PROFILE</Link>
          <Link to="/">RETURN TO PUBLICATION</Link>
        </nav>
        <p className="editorial-marker">SETTINGS</p>
        <h1 tabIndex={-1}>Panel settings</h1>
        <Form className="op-form" method="post">
          <label>
            Display name
            <input
              name="displayName"
              defaultValue={profile.display_name}
              required
              maxLength={80}
            />
          </label>
          <label>
            Approved pen name
            <input
              name="penName"
              defaultValue={profile.pen_name}
              maxLength={80}
            />
          </label>
          <label>
            Bio
            <textarea name="bio" defaultValue={profile.bio} maxLength={280} />
          </label>
          <label>
            Default public credit
            <select name="defaultCredit" defaultValue={profile.default_credit}>
              <option>Display name</option>
              <option>Pen name</option>
              <option>Anonymous Panelist</option>
            </select>
          </label>
          <p className="field-help">
            Public credit is chosen for each contribution. Changing this default
            does not rename previously published work or reveal anonymous
            contributions.
          </p>
          <BroadPreferences selected={profile.interests} />
          {actionResult?.error && <p role="alert">{actionResult.error}</p>}
          <button
            className="op-button action-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "submitting" ? "SAVING…" : "SAVE SETTINGS"}
          </button>
          <Link className="op-button" to="/profile">
            CANCEL
          </Link>
        </Form>
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
