import { useSearchParams } from "react-router";
import { AuthCompletion } from "../components/AuthCompletion";
import { safeReturnPath } from "../lib/handbook";
export const meta = () => [
  { title: "Completing your sign-in — KOMA://PLAY" },
  { name: "robots", content: "noindex, nofollow" },
];
export default function Complete() {
  const [params] = useSearchParams();
  return (
    <AuthCompletion
      returnTo={safeReturnPath(params.get("returnTo"), "/profile")}
    />
  );
}
