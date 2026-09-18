export const KOMA_FEATURE_PLACEHOLDER = "/assets/koma-feature-placeholder.svg";
export const KOMA_FEATURE_PLACEHOLDER_ALT = "KOMA://PLAY editorial placeholder";

const brokenEditorialPlaceholders = new Set([
  "/assets/koma-vhs-v2.svg",
]);

export function resolvePublicMediaPath(path: string | null | undefined) {
  const value = (path ?? "").trim();
  if (!value || brokenEditorialPlaceholders.has(value)) return KOMA_FEATURE_PLACEHOLDER;
  return value;
}

export function resolvePublicImageAlt(alt: string | null | undefined) {
  const value = (alt ?? "").trim();
  return value || KOMA_FEATURE_PLACEHOLDER_ALT;
}
