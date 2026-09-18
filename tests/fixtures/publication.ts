

import type { Catalogue, Issue, Feature } from "../../router-app/lib/publication";
export function publicationFixture(
  now = new Date().toISOString(),
): Catalogue {
  const issue: Issue = {
    id: "demo-zero",
    issue_number: 0,
    slug: "issue-zero-september-2026",
    title: "Issue Zero",
    subtitle: "A living publication for games / manga / anime",
    cover_label: "KOMA://PLAY / 000",
    introduction: "Read the clues. Enter the panel.",
    year: 2026,
    month: 9,
    status: "current",
    opens_at: "2026-09-01T00:00:00Z",
    closes_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    closing_days: 7,
  };
  const archive: Issue = {
    ...issue,
    id: "demo-archive",
    issue_number: 99,
    cover_label: "KOMA://PLAY / DEMO",
    slug: "demo-archive-august-2026",
    title: "The pilot edition",
    subtitle: "Development archive example",
    year: 2026,
    month: 8,
    status: "archived",
    opens_at: "2026-08-01T00:00:00Z",
    closes_at: "2026-09-01T00:00:00Z",
    archived_at: "2026-09-01T00:00:00Z",
    introduction:
      "A lightweight archive preview. This is clearly marked demonstration content, not a historical published issue.",
  };
  const categories = ["Gaming", "Anime", "Manga", "Culture"].map((name) => ({
    id: name.toLowerCase(),
    name,
    slug: name.toLowerCase(),
  }));
  const formats = [
    "News",
    "Guide",
    "Review",
    "Essay",
    "Impressions",
    "Discovery",
  ].map((name) => ({ id: name.toLowerCase(), name, slug: name.toLowerCase() }));
  const features: Feature[] = ["first", "second", "guide", "animation"].map((slug, index) => ({
    id: slug, slug, title: slug === "guide" ? "A playing guide" : slug,
    status: "published", issue_id: issue.id, weekly_drop_id: "demo-drop",
    strip_position: index + 1, category_id: index === 3 ? "anime" : "gaming",
    format_id: slug === "guide" ? "guide" : "essay", lifecycle_status: "open_panel",
    deadline_override: null, published_at: "2026-09-10T00:00:00Z", finalised_at: null,
    archived_at: null, summary: "A test panel", image: "/image.png", image_alt: "Test image",
    panel_size: "standard", panel_class: "", editorial_body: "Test body",
    current_revision: 1, updated_at: "2026-09-10T00:00:00Z",
  }));
  features.push({
    ...features[3],
    id: "demo-archive-feature",
    slug: "demo-the-painted-frame",
    title: "THE PAINTED FRAME",
    issue_id: archive.id,
    weekly_drop_id: "demo-archive-drop",
    lifecycle_status: "archived",
    published_at: "2026-08-10T00:00:00Z",
    finalised_at: archive.closes_at,
    archived_at: archive.archived_at,
    editorial_body:
      "Development archive example. A preserved editorial note about the texture of painted backgrounds. Closed Workshops retain their history; new observations belong in a later feature.",
  });
  return {
    issues: [issue, archive],
    drops: [
      {
        id: "demo-drop",
        issue_id: issue.id,
        week_number: 1,
        label: "First Frame",
        introduction: "Four clues. Four ways in.",
        status: "published",
        scheduled_at: null,
        published_at: "2026-09-10T00:00:00Z",
        display_order: 1,
      },
      {
        id: "demo-archive-drop",
        issue_id: archive.id,
        week_number: 1,
        label: "Pilot Frame",
        introduction: "Development preview",
        status: "published",
        scheduled_at: null,
        published_at: "2026-08-10T00:00:00Z",
        display_order: 1,
      },
    ],
    features,
    categories,
    formats,
    tags: [
      { id: "guide", name: "Playing", slug: "guide", kind: "franchise" },
      {
        id: "retro-anime",
        name: "Retro Anime",
        slug: "retro-anime",
        kind: "subject",
      },
    ],
    featureTags: [
      { feature_id: "guide", tag_id: "guide" },
      { feature_id: "animation", tag_id: "retro-anime" },
      { feature_id: "demo-archive-feature", tag_id: "retro-anime" },
    ],
    relationships: [],
    credits: [],
    profiles: [],
    message:
      "Development preview · Supabase is not configured. Articles remain readable; publishing and community mutations require setup.",
    now,
  };
}
