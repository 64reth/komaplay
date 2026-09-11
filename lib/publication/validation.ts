import { z } from "zod";
const id = z.string().uuid();
const text = z.string().trim();
const slug = text.regex(/^[a-z0-9-]+$/).max(150);
const date = z.string().datetime({ offset: true });
const optionalDate = z.union([date, z.literal("")]).optional();
export const issueSchema = z
  .object({
    id: id.optional(),
    issue_number: z.coerce.number().int().min(0),
    slug,
    title: text.min(1).max(150),
    subtitle: text.max(300).default(""),
    cover_label: text.max(100).default(""),
    introduction: text.max(4000).default(""),
    year: z.coerce.number().int().min(2000).max(2200),
    month: z.coerce.number().int().min(1).max(12),
    opens_at: date,
    closes_at: date,
    closing_days: z.coerce.number().int().min(0).max(30),
  })
  .refine(
    (v) => Date.parse(v.closes_at) > Date.parse(v.opens_at),
    "Closing time must follow opening time.",
  );
export const dropSchema = z
  .object({
    id: id.optional(),
    issue_id: id,
    week_number: z.coerce.number().int().min(1).max(5),
    label: text.min(1).max(150),
    introduction: text.max(4000).default(""),
    status: z.enum(["draft", "scheduled", "published"]),
    scheduled_at: optionalDate,
    display_order: z.coerce.number().int().min(0),
  })
  .refine(
    (v) => v.status !== "scheduled" || !!v.scheduled_at,
    "Set a publication time for a scheduled drop.",
  );
export const featureSchema = z.object({
  id: id.optional(),
  slug,
  title: text.min(4).max(150),
  issue_id: id,
  weekly_drop_id: id,
  strip_position: z.coerce.number().int().min(0),
  category_id: id,
  format_id: id,
  lifecycle_status: z.enum(["draft", "open_panel"]),
  deadline_override: optionalDate,
  summary: text.max(300).default(""),
  editorial_body: text.max(30000).default(""),
  image: text.regex(/^\/assets\/[a-zA-Z0-9._-]+$/),
  image_alt: text.max(300).default(""),
  panel_size: z.enum(["narrow", "standard", "wide"]),
  panel_class: z.enum(["", "ocarina", "vice", "tokon", "vhs"]),
  tag_ids: z.array(id).max(30).default([]),
});
export const correctionKinds = [
  "Factual error",
  "Incorrect attribution",
  "Broken source",
  "Safety concern",
  "Legal or rights concern",
] as const;
export const correctionSchema = z.object({
  feature_id: id,
  kind: z.enum(correctionKinds),
  body: text.min(20).max(4000),
  source_url: text
    .max(2000)
    .refine(
      (v) => !v || /^https:\/\/[^/@\s]+(?:[/:?#][^\s]*)?$/.test(v),
      "Use an HTTPS source URL.",
    )
    .default(""),
});
export const schemas = {
  issue: issueSchema,
  drop: dropSchema,
  feature: featureSchema,
  "issue-state": z.object({
    id,
    status: z.enum(["current", "finalising", "archived"]),
  }),
  category: z.object({ name: text.min(1).max(80), slug }),
  format: z.object({ name: text.min(1).max(80), slug }),
  tag: z.object({
    name: text.min(1).max(80),
    slug,
    kind: z.enum(["franchise", "platform", "genre", "era", "subject"]),
  }),
  relationship: z.object({
    feature_id: id,
    related_id: id,
    kind: z.enum(["continues_from", "related"]),
  }),
};
