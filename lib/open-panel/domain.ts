import { z } from "zod";
export const types = [
  "Tip",
  "Correction",
  "Strategy",
  "Counterpoint",
  "Screenshot",
  "Source",
  "Example",
  "Recommendation",
  "Timeline",
  "Personal Experience",
  "Question",
] as const;
export const statuses = [
  "Submitted",
  "In Review",
  "Changes Requested",
  "Accepted",
  "Rejected",
] as const;
export const sections = [
  "Overview",
  "Choosing a fighter",
  "Assists",
  "Practice",
  "Sources",
] as const;
export type Role = "member" | "contributor" | "moderator" | "admin";
export const canModerate = (role?: string) =>
  role === "moderator" || role === "admin";
export const canEdit = (status: string) =>
  status === "Submitted" || status === "Changes Requested";
export const canTransition = (from: string, to: string) =>
  ["Submitted", "In Review", "Changes Requested"].includes(from) &&
  ["In Review", "Changes Requested", "Accepted", "Rejected"].includes(to) &&
  from !== to;
export const safeUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
export const safeMedia = (value: string) => {
  try {
    const u = new URL(value);
    return (
      safeUrl(value) &&
      [
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "twitch.tv",
        "www.twitch.tv",
        "clips.twitch.tv",
      ].includes(u.hostname)
    );
  } catch {
    return false;
  }
};
const url = z
  .string()
  .max(2000)
  .refine((v) => !v || safeUrl(v), "Use an HTTPS URL without credentials.");
export const contributionSchema = z
  .object({
    feature_id: z.string().uuid(),
    type: z.enum(types),
    target_section: z.enum(sections),
    title: z.string().trim().min(4).max(120),
    body: z.string().trim().min(20).max(8000),
    source_url: url.default(""),
    media_url: url
      .refine((v) => !v || safeMedia(v), "Use a YouTube or Twitch HTTPS URL.")
      .default(""),
    screenshot_path: z
      .string()
      .max(250)
      .regex(/^$|^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/)
      .default(""),
  })
  .refine((v) => v.type !== "Screenshot" || !!v.screenshot_path, {
    message: "Upload a screenshot for this contribution type.",
    path: ["screenshot_path"],
  });
export const moderationSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["In Review", "Changes Requested", "Accepted", "Rejected"]),
    heading: z.string().trim().max(120).default(""),
    body: z.string().trim().max(8000).default(""),
    note: z.string().trim().max(2000).default(""),
  })
  .refine(
    (v) =>
      v.status !== "Accepted" || (v.heading.length >= 4 && v.body.length >= 20),
    "Published heading and body are required.",
  )
  .refine(
    (v) =>
      !["Changes Requested", "Rejected"].includes(v.status) ||
      v.note.length >= 4,
    "Explain your decision in a moderator note.",
  );
export function screenshotError(file: { size: number; type: string }) {
  return file.size > 5 * 1024 * 1024
    ? "Screenshots must be 5 MB or smaller."
    : !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      ? "Use PNG, JPEG or WebP screenshots."
      : null;
}
export type ContributionInput = z.infer<typeof contributionSchema>;
export type Credit = { id: string; display_name: string };
export type Contribution = ContributionInput & {
  id: string;
  author_id: string;
  status: string;
  moderator_note: string | null;
  created_at: string;
  updated_at: string;
  author?: Credit;
  feature?: { title: string; slug: string };
};
export type Addition = {
  screenshot_path?: string;
  source_url?: string;
  media_url?: string;
  id: string;
  contribution_id: string;
  heading: string;
  body: string;
  target_section: string;
  contributor_id: string;
  revision_number: number;
  published_at: string;
  contributor?: Credit;
};
export type Revision = {
  id: string;
  revision_number: number;
  summary: string;
  created_at: string;
  contributor_ids: string[];
};
export type PanelData = {
  feature: {
    id: string;
    title: string;
    slug: string;
    current_revision: number;
    updated_at: string;
  };
  additions: Addition[];
  revisions: Revision[];
  credits: Credit[];
};
export const splitCredits = (credits: Credit[]) => ({
  visible: credits.slice(0, 4),
  extra: credits.slice(4),
});
export const publishedCredits = (additions: Addition[]) => [
  ...new Map(
    additions
      .filter((a) => a.contributor)
      .map((a) => [a.contributor_id, a.contributor!]),
  ).values(),
];
