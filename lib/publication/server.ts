import { serverClient } from "../supabase/server";
import { developmentCatalogue } from "../../data/publication-demo";
import type { Catalogue } from "./domain";
export async function catalogue(editorial = false): Promise<Catalogue> {
  const db = await serverClient();
  if (!db) return developmentCatalogue();
  const empty: Catalogue = {
    issues: [],
    drops: [],
    features: [],
    categories: [],
    formats: [],
    tags: [],
    featureTags: [],
    relationships: [],
    credits: [],
    profiles: [],
    demo: false,
    message: null,
    now: new Date().toISOString(),
  };
  try {
    const names = [
      "issues",
      "weekly_drops",
      "features",
      "categories",
      "content_formats",
      "tags",
      "feature_tags",
      "feature_relationships",
      "published_additions",
      "public_profiles",
    ] as const;
    const results = await Promise.all(
      names.map(async (name) => {
        const rows: unknown[] = [];
        const columns =
          name === "published_additions"
            ? "feature_id,contributor_id"
            : name === "public_profiles"
              ? "id,display_name"
              : "*";
        for (let offset = 0; ; offset += 1000) {
          let query = db.from(name).select(columns);
          if (name === "feature_tags")
            query = query.order("feature_id").order("tag_id");
          else if (name === "feature_relationships")
            query = query.order("feature_id").order("related_id").order("kind");
          else query = query.order("id");
          const { data, error } = await query.range(offset, offset + 999);
          if (error) throw new Error("Catalogue unavailable");
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) return rows;
        }
      }),
    );
    const [
      issues,
      drops,
      features,
      categories,
      formats,
      tags,
      featureTags,
      relationships,
      credits,
      profiles,
    ] = results;
    const result = {
      ...empty,
      issues,
      drops,
      features,
      categories,
      formats,
      tags,
      featureTags,
      relationships,
      credits,
      profiles,
    } as unknown as Catalogue;
    if (!editorial) {
      result.issues = result.issues.filter((i) => i.status !== "draft");
      result.drops = result.drops.filter(
        (d) =>
          d.status === "published" &&
          Date.parse(d.published_at ?? "") <= Date.now() &&
          result.issues.some((i) => i.id === d.issue_id),
      );
      result.features = result.features.filter(
        (f) =>
          f.status === "published" &&
          f.lifecycle_status !== "draft" &&
          Date.parse(f.published_at) <= Date.now() &&
          result.drops.some((d) => d.id === f.weekly_drop_id),
      );
    }
    return result;
  } catch {
    return {
      ...empty,
      message:
        "Publication data is temporarily unavailable. Check the Supabase migrations and connection, then retry.",
    };
  }
}
