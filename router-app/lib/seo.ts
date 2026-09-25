export const siteOrigin = "https://komaplay.com";
export function privatePath(path: string) {
  return (
    /^\/(?:editorial|moderation|cover-editor|publishing|profile|onboarding|auth|member|api)(?:\/|$)/.test(
      path,
    ) || /^\/features\/[^/]+\/(workshop|correction)$/.test(path)
  );
}
export function xmlEscape(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
