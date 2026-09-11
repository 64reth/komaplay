import { AuthGate } from "../../components/open-panel/AuthGate";
import {
  AuthenticatedOnboarding,
  OnboardingFlow,
  previewVersion,
} from "../../components/handbook/OnboardingFlow";
import { catalogue } from "../../lib/publication/server";
import { acceptsContributions } from "../../lib/publication/domain";
import { safeReturnPath } from "../../lib/handbook/domain";
export const dynamic = "force-dynamic";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; step?: string }>;
}) {
  const query = await searchParams;
  const data = await catalogue();
  const active = data.features.find((feature) => {
    const issue = data.issues.find((item) => item.id === feature.issue_id);
    return issue && acceptsContributions(feature, issue, data.now);
  });
  const returnTo = safeReturnPath(query.returnTo);
  const step = Math.min(4, Math.max(1, Number(query.step) || 1));
  return (
    <main className="editorial-page">
      <div className="op-workspace handbook-page">
        <p className="op-eyebrow">INK//:PLAY / COMMUNITY HANDBOOK</p>
        {data.demo ? (
          <OnboardingFlow
            version={previewVersion}
            returnTo={returnTo}
            initialStep={step}
            firstWorkshop={active ? `/features/${active.slug}/workshop` : null}
            preview
          />
        ) : (
          <AuthGate>
            {() => (
              <AuthenticatedOnboarding
                returnTo={returnTo}
                initialStep={step}
                firstWorkshop={
                  active ? `/features/${active.slug}/workshop` : null
                }
              />
            )}
          </AuthGate>
        )}
      </div>
    </main>
  );
}
