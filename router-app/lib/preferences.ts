export const broadPreferences = [
  "gaming",
  "anime",
  "culture",
  "manga",
] as const;
export type BroadPreference = (typeof broadPreferences)[number];
export function broadInterests(values: unknown): BroadPreference[] {
  return Array.isArray(values)
    ? broadPreferences.filter((value) => values.includes(value))
    : [];
}
