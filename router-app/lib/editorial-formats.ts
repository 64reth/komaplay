// Classification metadata only; every format uses the same composer and lifecycle.
export const editorialFormatSlugs = ["essay", "review", "feature", "editorial", "news", "interview"] as const;
export type EditorialFormat = (typeof editorialFormatSlugs)[number];
export const editorialFormatLabels: Record<EditorialFormat, string> = {
  essay: "Essay", review: "Review", feature: "Feature", editorial: "Editorial", news: "News", interview: "Interview",
};
