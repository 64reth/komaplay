import type { FeatureItem } from "../../data/issue-zero";
export type Issue = {
  id: string;
  issue_number: number;
  slug: string;
  title: string;
  subtitle: string;
  cover_label: string;
  introduction: string;
  year: number;
  month: number;
  status: "draft" | "current" | "finalising" | "archived";
  opens_at: string;
  closes_at: string;
  archived_at: string | null;
  closing_days: number;
};
export type Drop = {
  id: string;
  issue_id: string;
  week_number: number;
  label: string;
  introduction: string;
  status: "draft" | "scheduled" | "published";
  scheduled_at: string | null;
  published_at: string | null;
  display_order: number;
};
export type Taxonomy = { id: string; name: string; slug: string };
export type Tag = Taxonomy & { kind: string };
export type Feature = {
  id: string;
  slug: string;
  title: string;
  status: string;
  issue_id: string;
  weekly_drop_id: string;
  strip_position: number;
  category_id: string;
  format_id: string;
  lifecycle_status: string;
  deadline_override: string | null;
  published_at: string;
  finalised_at: string | null;
  archived_at: string | null;
  summary: string;
  image: string;
  image_alt: string;
  panel_size: FeatureItem["panelSize"];
  panel_class: string;
  editorial_body: string;
  current_revision: number;
  updated_at: string;
};
export type Catalogue = {
  issues: Issue[];
  drops: Drop[];
  features: Feature[];
  categories: Taxonomy[];
  formats: Taxonomy[];
  tags: Tag[];
  featureTags: { feature_id: string; tag_id: string }[];
  relationships: { feature_id: string; related_id: string; kind: string }[];
  credits: { feature_id: string; contributor_id: string }[];
  profiles: { id: string; display_name: string }[];
  demo: boolean;
  message: string | null;
  now: string;
};
export const deadline = (feature: Feature, issue: Issue) =>
  feature.deadline_override ?? issue.closes_at;
export function panelState(
  feature: Feature,
  issue: Issue,
  now: string | number = Date.now(),
) {
  const time = typeof now === "number" ? now : Date.parse(now);
  if (feature.lifecycle_status === "draft" || feature.status === "draft")
    return "draft";
  if (issue.status === "archived" || feature.lifecycle_status === "archived")
    return "archived";
  if (
    feature.lifecycle_status === "final_panel" ||
    time >= Date.parse(deadline(feature, issue))
  )
    return "final_panel";
  if (
    time >=
    Date.parse(deadline(feature, issue)) - issue.closing_days * 86400000
  )
    return "closing_panel";
  return "open_panel";
}
export function acceptsContributions(
  feature: Feature,
  issue: Issue,
  now: string | number = Date.now(),
) {
  const state = panelState(feature, issue, now);
  return (
    ["open_panel", "closing_panel"].includes(state) &&
    ["current", "finalising"].includes(issue.status) &&
    Number(new Date(issue.opens_at)) <= Number(new Date(now))
  );
}
export const issueState = (issue: Issue, now: string) =>
  issue.status === "current" && Date.parse(issue.closes_at) <= Date.parse(now)
    ? "finalising"
    : issue.status;
export function orderedDrops(drops: Drop[], newestFirst = false) {
  return [...drops].sort((a, b) => {
    const dates =
      Date.parse(a.published_at ?? a.scheduled_at ?? "1970-01-01") -
      Date.parse(b.published_at ?? b.scheduled_at ?? "1970-01-01");
    return newestFirst
      ? -(a.display_order - b.display_order || dates)
      : a.display_order - b.display_order || dates;
  });
}
export type DiscoveryFilters = {
  q?: string;
  category?: string;
  format?: string;
  issue?: string;
  tag?: string;
  status?: string;
  contributor?: string;
  filter?: string;
};
export function filterFeatures(data: Catalogue, filters: DiscoveryFilters) {
  return data.features.filter((f) => {
    const issue = data.issues.find((i) => i.id === f.issue_id);
    if (!issue) return false;
    const category = data.categories.find((c) => c.id === f.category_id);
    const format = data.formats.find((c) => c.id === f.format_id);
    const tags = data.tags.filter((t) =>
      data.featureTags.some(
        (ft) => ft.feature_id === f.id && ft.tag_id === t.id,
      ),
    );
    if (filters.issue && issue.slug !== filters.issue) return false;
    if (filters.category && category?.slug !== filters.category) return false;
    if (filters.format && format?.slug !== filters.format) return false;
    if (filters.tag && !tags.some((t) => t.slug === filters.tag)) return false;
    if (
      filters.contributor &&
      !data.credits.some(
        (c) =>
          c.feature_id === f.id && c.contributor_id === filters.contributor,
      )
    )
      return false;
    if (filters.status === "open" && !acceptsContributions(f, issue, data.now))
      return false;
    if (
      filters.status === "closed" &&
      !["final_panel", "archived"].includes(panelState(f, issue, data.now))
    )
      return false;
    if (filters.filter === "gaming" && category?.slug !== "gaming")
      return false;
    if (
      filters.filter === "anime-manga" &&
      !["anime", "manga"].includes(category?.slug ?? "")
    )
      return false;
    if (filters.filter === "guides" && format?.slug !== "guide") return false;
    if (filters.filter === "open" && !acceptsContributions(f, issue, data.now))
      return false;
    const search = [
      f.title,
      f.summary,
      f.editorial_body,
      ...tags.map((t) => t.name),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      !filters.q ||
      filters.q
        .toLocaleLowerCase()
        .split(/\s+/)
        .every((word) => search.includes(word))
    );
  });
}
export function archiveIssues(data: Catalogue, filters: DiscoveryFilters) {
  const features = filterFeatures(data, filters);
  return data.issues
    .filter(
      (i) =>
        i.status === "archived" && features.some((f) => f.issue_id === i.id),
    )
    .sort((a, b) => b.year - a.year || b.month - a.month);
}
export function stripItems(
  data: Catalogue,
  drop: Drop,
  features = data.features,
): FeatureItem[] {
  const issue = data.issues.find((i) => i.id === drop.issue_id);
  return features
    .filter((f) => f.weekly_drop_id === drop.id)
    .sort((a, b) => a.strip_position - b.strip_position)
    .map((f, i) => ({
      id: f.slug,
      issueNumber: String(issue?.issue_number ?? 0).padStart(3, "0"),
      category:
        data.categories.find((c) => c.id === f.category_id)?.name ?? "Feature",
      title: f.title,
      summary: f.summary,
      image: f.image,
      imageAlt: f.image_alt,
      pageIndex: i + 1,
      panelSize: f.panel_size,
      panelClass: f.panel_class,
    }));
}
