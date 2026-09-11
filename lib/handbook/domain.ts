import approved from "../../data/handbook-v1.json";
export { approved };
export type HandbookVersion = {
  id: string;
  identifier: string;
  label: string;
  content: string;
  content_hash: string;
  acceptance_statement: string;
  statement_version: string;
  published_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};
export type HandbookAcceptance = {
  user_id: string;
  handbook_version_id: string;
  accepted_at: string;
  statement_version: string;
};
export type HandbookState = {
  status: "accepted" | "required" | "unavailable";
  version: HandbookVersion | null;
  acceptance: HandbookAcceptance | null;
  message?: string;
};
export function needsOnboarding(
  version: HandbookVersion | null,
  acceptance: HandbookAcceptance | null,
) {
  return (
    !version ||
    !acceptance ||
    acceptance.handbook_version_id !== version.id ||
    acceptance.statement_version !== version.statement_version
  );
}
// Only known reading/participation destinations; never auth, API, or recursively nested redirects.
export function safeReturnPath(
  value: unknown,
  fallback = "/",
  preserveOnboardingReturn = true,
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value) ||
    /%(?:5c|0[0-9a-f]|1[0-9a-f])/i.test(value) ||
    (/%2f/i.test(value) && !value.startsWith("/onboarding?"))
  )
    return fallback;
  try {
    const url = new URL(value, "https://ink.local");
    if (url.origin !== "https://ink.local") return fallback;
    if (
      !/^\/$|^\/(archive|search|moderation|publishing|handbook|onboarding|profile(?:\/settings)?)$|^\/features\/[a-z0-9-]+(?:\/(?:workshop|correction))?$|^\/issues\/[a-z0-9-]+$/.test(
        url.pathname,
      )
    )
      return fallback;
    const query = new URLSearchParams();
    if (preserveOnboardingReturn && url.pathname === "/onboarding") {
      const nested = url.searchParams.get("returnTo");
      if (nested) {
        const safeNested = safeReturnPath(nested, "/", false);
        if (safeNested === "/" && nested !== "/") return fallback;
        query.set("returnTo", safeNested);
      }
    }
    for (const key of [
      "q",
      "filter",
      "category",
      "format",
      "issue",
      "tag",
      "status",
      "contributor",
    ]) {
      const v = url.searchParams.get(key);
      if (v && v.length <= 200) query.set(key, v);
    }
    return url.pathname + (query.size ? "?" + query.toString() : "");
  } catch {
    return fallback;
  }
}
export function onboardingHref(returnTo: unknown) {
  return `/onboarding?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`;
}
export const panelTitles = [
  "Welcome to the Panel",
  "How We Move",
  "Publishing and Protection",
  "Your Mark and the Compact",
] as const;
export function handbookPanels(content: string) {
  const starts = [
    "# WELCOME TO KOMA://PLAY",
    "## HOW WE MOVE",
    "## WHAT KOMA://PLAY PROMISES",
    "## YOUR MARK",
  ];
  const positions = starts.map((s) => content.indexOf(s));
  if (positions.some((p, i) => p < 0 || (i > 0 && p <= positions[i - 1])))
    return null;
  return positions.map((p, i) =>
    content.slice(p, positions[i + 1] ?? content.length).trim(),
  );
}
