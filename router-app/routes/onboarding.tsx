import {
  data,
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from "react-router";
import type { Route } from "./+types/onboarding";
import { Masthead } from "../components/Masthead";
import { OnboardingIntroduction } from "../components/handbook/OnboardingIntroduction";
import { OnboardingFlow } from "../components/handbook/OnboardingFlow";
import { resolveAuth } from "../lib/auth";
import { safeReturnPath } from "../lib/handbook";
import { membershipState } from "../lib/membership.server";

export const meta: Route.MetaFunction = () => [
  { title: "Enter the panel — KOMA://PLAY" },
  { name: "description", content: "Sign in to join the KOMA://PLAY Workshop." },
  {
    tagName: "link",
    rel: "canonical",
    href: "https://komaplay.com/onboarding",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const resolved = await resolveAuth(request);
  const url = new URL(request.url);
  let returnTo = safeReturnPath(url.searchParams.get("returnTo"), "/profile");
  if (returnTo.startsWith("/onboarding")) returnTo = "/profile";
  const step = Math.min(
    4,
    Math.max(1, Number(url.searchParams.get("step")) || 1),
  );

  if (
    resolved.auth.state === "unconfigured" ||
    resolved.auth.state === "signed-out"
  )
    return data(
      { state: "signed-out" as const, returnTo, step, version: null },
      { headers: resolved.headers },
    );
  if (
    (resolved.auth.state === "profile-unavailable" || resolved.auth.state === "resolving") ||
    !resolved.client ||
    !resolved.user
  )
    return data(
      {
        state: "unavailable" as const,
        returnTo,
        step,
        version: null,
        message: "Your membership profile could not be verified.",
      },
      { headers: resolved.headers },
    );
  if (resolved.auth.member.accountStatus !== "active")
    return data(
      {
        state: resolved.auth.member.accountStatus,
        returnTo,
        step,
        version: null,
      },
      { headers: resolved.headers },
    );

  const membership = await membershipState(resolved.client, resolved.user.id);
  if (membership.status === "accepted")
    return redirect(returnTo, { headers: resolved.headers });
  return data(
    {
      state: membership.status,
      returnTo,
      step,
      version: membership.version,
      message: membership.message,
    },
    { headers: resolved.headers },
  );
}

export default function Onboarding() {
  const result = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace handbook-page">
        {result.state === "signed-out" && (
          <OnboardingIntroduction returnTo={result.returnTo} />
        )}
        {(result.state === "restricted" || result.state === "suspended") && (
          <section>
            <p className="editorial-marker">MEMBERSHIP ACCESS</p>
            <h1>ONBOARDING IS NOT AVAILABLE FOR THIS ACCOUNT</h1>
            <p role="alert">
              This account cannot enter member spaces at the moment. Contact the
              editorial team for help or an appeal.
            </p>
            <Link className="op-button" to="/">
              RETURN TO PUBLICATION
            </Link>
          </section>
        )}
        {result.state === "required" && result.version && (
          <section>
            <Link to="/">← RETURN TO PUBLICATION</Link>
            <OnboardingFlow
              version={result.version}
              returnTo={result.returnTo}
              initialStep={result.step}
              onAccepted={() => {
                void revalidator.revalidate();
                navigate(result.returnTo, { replace: true });
              }}
            />
          </section>
        )}
        {(result.state === "unavailable" ||
          (result.state === "required" && !result.version)) && (
          <section>
            <p className="editorial-marker">HANDBOOK UNAVAILABLE</p>
            <h1>THE POCKET GUIDE IS TEMPORARILY UNAVAILABLE</h1>
            <p role="alert">
              {result.message ??
                "Membership cannot be verified right now. Return to the publication and try again shortly."}
            </p>
            <Link className="op-button action-primary" to="/">
              RETURN TO PUBLICATION
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
