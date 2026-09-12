import type { Route } from "./+types/onboarding";
import { Masthead } from "../components/Masthead";
import { OnboardingIntroduction } from "../components/handbook/OnboardingIntroduction";
export const meta: Route.MetaFunction = () => [
  { title: "Enter the panel — KOMA://PLAY" },
  { name: "description", content: "Sign in to join the KOMA://PLAY Workshop." },
  {
    tagName: "link",
    rel: "canonical",
    href: "https://komaplay.com/onboarding",
  },
];
export default function Onboarding() {
  return (
    <main className="editorial-page">
      <Masthead />
      <div className="op-workspace handbook-page">
        <OnboardingIntroduction />
      </div>
    </main>
  );
}
