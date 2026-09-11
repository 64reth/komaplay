/** The one public VHS artwork used by KOMA://PLAY development features. */
export const KOMA_VHS_ASSET = "/assets/koma-vhs-v2.png";

// Content written before the rebrand can remain in Supabase until migration
// 008 is applied. Resolve only the known development placeholders at read time.
const retiredVhsAssets = new Set([
  "/assets/clue-vhs.png",
  "/assets/koma-vhs.png",
]);

export function resolvePublicMediaPath(path: string) {
  return retiredVhsAssets.has(path) ? KOMA_VHS_ASSET : path;
}
