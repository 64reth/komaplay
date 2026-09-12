import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { developmentCatalogue } from "../data/publication-demo";
import type { Catalogue } from "./publication";
import { resolvePublicMediaPath } from "./publication-media";
import type {
  PanelData,
  Addition,
  Revision,
  PanelCitation,
} from "./open-panel";
import { publishedCredits } from "./open-panel";

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
}

const empty = (): Catalogue => ({
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
});

const publicColumns = {
  issues:
    "id,issue_number,slug,title,subtitle,cover_label,introduction,year,month,status,opens_at,closes_at,archived_at,closing_days",
  weekly_drops:
    "id,issue_id,week_number,label,introduction,status,scheduled_at,published_at,display_order",
  features:
    "id,slug,title,status,issue_id,weekly_drop_id,strip_position,category_id,format_id,lifecycle_status,deadline_override,published_at,finalised_at,archived_at,summary,image,image_alt,panel_size,panel_class,editorial_body,current_revision,updated_at",
  categories: "id,name,slug",
  content_formats: "id,name,slug",
  tags: "id,name,slug,kind",
  feature_tags: "feature_id,tag_id",
  feature_relationships: "feature_id,related_id,kind",
  published_additions: "feature_id,contributor_id",
  public_profiles: "id,display_name",
} as const;

type PublicTable = keyof typeof publicColumns;

async function publicRows(db: SupabaseClient, name: PublicTable) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from(name).select(publicColumns[name]);
    if (name === "feature_tags")
      query = query.order("feature_id").order("tag_id");
    else if (name === "feature_relationships") {
      query = query.order("feature_id").order("related_id").order("kind");
    } else query = query.order("id");
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error(`Public ${name} query failed`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function catalogue(): Promise<Catalogue> {
  const db = client();
  if (!db) return developmentCatalogue();
  const base = empty();
  try {
    const names = Object.keys(publicColumns) as PublicTable[];
    const rows = await Promise.all(names.map((name) => publicRows(db, name)));
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
    ] = rows;
    const result = {
      ...base,
      issues,
      drops,
      features: (features as { image: string }[]).map((feature) => ({
        ...feature,
        image: resolvePublicMediaPath(feature.image),
      })),
      categories,
      formats,
      tags,
      featureTags,
      relationships,
      credits,
      profiles,
    } as unknown as Catalogue;
    result.issues = result.issues.filter((issue) => issue.status !== "draft");
    result.drops = result.drops.filter(
      (drop) =>
        drop.status === "published" &&
        Date.parse(drop.published_at ?? "") <= Date.now() &&
        result.issues.some((issue) => issue.id === drop.issue_id),
    );
    result.features = result.features.filter(
      (feature) =>
        feature.status === "published" &&
        feature.lifecycle_status !== "draft" &&
        Date.parse(feature.published_at) <= Date.now() &&
        result.drops.some((drop) => drop.id === feature.weekly_drop_id),
    );
    return result;
  } catch {
    return {
      ...base,
      message:
        "Publication data is temporarily unavailable. Please try again shortly.",
    };
  }
}

export async function publicPanel(
  slug: string,
): Promise<{ data: PanelData | null; message: string | null }> {
  const db = client();
  if (!db) {
    return {
      data: null,
      message:
        "Open Panel is awaiting Supabase setup. The Published Panel remains available.",
    };
  }
  try {
    const feature = await db
      .from("features")
      .select("id,title,slug,current_revision,updated_at")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (feature.error) throw feature.error;
    if (!feature.data) {
      return {
        data: null,
        message: "Open Panel has not been enabled for this feature yet.",
      };
    }
    const [additionsResult, revisionsResult, citationsResult] =
      await Promise.all([
        db
          .from("published_additions")
          .select(
            "id,contribution_id,feature_id,heading,body,target_section,display_order,contributor_id,screenshot_path,media_url,source_url,published_at,revision_number",
          )
          .eq("feature_id", feature.data.id)
          .order("display_order"),
        db
          .from("revisions")
          .select("id,revision_number,summary,created_at,contributor_ids")
          .eq("feature_id", feature.data.id)
          .order("revision_number", { ascending: false }),
        db
          .from("panel_citations")
          .select(
            "id,contribution_id,public_credit,contribution_type,source_url,submitted_at,reviewing_editor,published_at,revision_number,editorial_summary",
          )
          .eq("feature_id", feature.data.id),
      ]);
    if (
      additionsResult.error ||
      revisionsResult.error ||
      citationsResult.error
    ) {
      throw (
        additionsResult.error || revisionsResult.error || citationsResult.error
      );
    }
    const ids = [
      ...new Set((additionsResult.data ?? []).map((row) => row.contributor_id)),
    ];
    const profiles = ids.length
      ? await db.from("public_profiles").select("id,display_name").in("id", ids)
      : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    const additions = (additionsResult.data ?? []).map((row) => ({
      ...row,
      contributor: profiles.data?.find(
        (profile) => profile.id === row.contributor_id,
      ),
    })) as Addition[];
    return {
      data: {
        feature: feature.data,
        additions,
        revisions: revisionsResult.data as Revision[],
        credits: publishedCredits(additions),
        citations: citationsResult.data as PanelCitation[],
      },
      message: null,
    };
  } catch {
    return {
      data: null,
      message:
        "Open Panel is temporarily unavailable. You can still read this edition.",
    };
  }
}

export async function publicHandbook() {
  const db = client();
  if (!db) {
    return {
      version: null,
      message:
        "Development preview · connect Supabase to retrieve the active handbook.",
    };
  }
  const result = await db
    .from("handbook_versions")
    .select(
      "identifier,label,content,content_hash,acceptance_statement,statement_version,published_at,active",
    )
    .eq("active", true)
    .maybeSingle();
  return result.error || !result.data
    ? {
        version: null,
        message: "The active handbook is temporarily unavailable.",
      }
    : { version: result.data, message: null };
}

export async function signedPublishedImage(path: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/.test(path))
    return null;
  const db = client();
  if (!db) return null;
  const { data, error } = await db.storage
    .from("open-panel-screenshots")
    .createSignedUrl(path, 60);
  return error || !data ? null : data.signedUrl;
}
