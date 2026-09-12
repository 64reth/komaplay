/** The one public VHS artwork used by KOMA://PLAY development features. */
export const KOMA_VHS_ASSET = "/assets/koma-vhs-v2.png";
export const KOMA_FEATURE_PLACEHOLDER = "/assets/koma-feature-placeholder.svg";
export const KOMA_FEATURE_PLACEHOLDER_ALT = "KOMA://PLAY editorial placeholder";

// Content written before the rebrand can remain in Supabase until migration
// 008 is applied. Resolve only the known development placeholders at read time.
const retiredVhsAssets = new Set([
  "/assets/clue-vhs.png",
  "/assets/koma-vhs.png",
]);

export function resolvePublicMediaPath(path: string | null | undefined) {
  const value = (path ?? "").trim();
  if (!value) return KOMA_FEATURE_PLACEHOLDER;
  return retiredVhsAssets.has(value) ? KOMA_VHS_ASSET : value;
}

export function resolvePublicImageAlt(alt: string | null | undefined) {
  const value = (alt ?? "").trim();
  return value || KOMA_FEATURE_PLACEHOLDER_ALT;
}
