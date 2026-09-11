import Link from "next/link";
import { redirect } from "next/navigation";
import { EditorialHeader } from "../../components/EditorialNavigation";
import { OnboardingIntroduction } from "../../components/handbook/OnboardingIntroduction";
import { StandaloneOnboardingFlow } from "../../components/handbook/StandaloneOnboardingFlow";
import {
  onboardingReturnDestination,
  onboardingRouteOutcome,
  type OnboardingRouteOutcome,
} from "../../lib/handbook/onboarding-route";
import { handbookState } from "../../lib/handbook/server";
import type { HandbookVersion } from "../../lib/handbook/domain";
import { HttpError } from "../../lib/open-panel/errors";
import { identity } from "../../lib/open-panel/server";

export const dynamic = "force-dynamic";

type ResolvedOnboarding = {
  outcome: OnboardingRouteOutcome;
  version: HandbookVersion | null;
};

async function resolveOnboarding(): Promise<ResolvedOnboarding> {
  try {
    const { db, user } = await identity();
    const handbook = await handbookState(db, user.id);
    return {
      outcome: onboardingRouteOutcome({
        session: true,
        accountStatus: "active",
        handbookStatus: handbook.status,
      }),
      version: handbook.version,
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 401)
      return { outcome: "signed-out", version: null };
    if (error instanceof HttpError && error.status === 403)
      return { outcome: "restricted", version: null };
    return { outcome: "unavailable", version: null };
  }
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="editorial-page">
      <EditorialHeader />
      <div className="op-workspace handbook-page">{children}</div>
    </main>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; step?: string }>;
}) {
  const query = await searchParams;
  const returnTo = onboardingReturnDestination(query.returnTo);
  const initialStep = Math.min(4, Math.max(1, Number(query.step) || 1));
  const resolved = await resolveOnboarding();

  if (resolved.outcome === "accepted") redirect(returnTo);
  if (resolved.outcome === "signed-out")
    return (
      <PageFrame>
        <OnboardingIntroduction />
      </PageFrame>
    );
  if (resolved.outcome === "restricted")
    return (
      <PageFrame>
        <p className="op-eyebrow editorial-marker">MEMBERSHIP ACCESS</p>
        <h1>ONBOARDING IS NOT AVAILABLE FOR THIS ACCOUNT</h1>
        <p role="alert">
          This account cannot enter the Workshop at the moment. Contact the
          editorial team if you need help or an appeal.
        </p>
        <Link className="op-button" href="/">
          RETURN TO PUBLICATION
        </Link>
      </PageFrame>
    );
  if (resolved.outcome === "required" && resolved.version)
    return (
      <PageFrame>
        <Link href="/">← RETURN TO PUBLICATION</Link>
        <StandaloneOnboardingFlow
          version={resolved.version}
          returnTo={returnTo}
          initialStep={initialStep}
        />
      </PageFrame>
    );
  return (
    <PageFrame>
      <p className="op-eyebrow editorial-marker">HANDBOOK UNAVAILABLE</p>
      <h1>THE POCKET GUIDE IS TEMPORARILY UNAVAILABLE</h1>
      <p role="alert">
        Membership cannot be verified right now. Please return to the
        publication and try again shortly.
      </p>
      <Link className="op-button action-primary" href="/">
        RETURN TO PUBLICATION
      </Link>
    </PageFrame>
  );
}
