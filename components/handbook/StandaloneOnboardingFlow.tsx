"use client";

import { useRouter } from "next/navigation";
import { OnboardingFlow } from "./OnboardingFlow";
import type { HandbookVersion } from "../../lib/handbook/domain";

export function StandaloneOnboardingFlow({
  version,
  returnTo,
  initialStep,
}: {
  version: HandbookVersion;
  returnTo: string;
  initialStep: number;
}) {
  const router = useRouter();
  return (
    <OnboardingFlow
      version={version}
      returnTo={returnTo}
      initialStep={initialStep}
      onAccepted={() => router.replace(returnTo)}
    />
  );
}
