import { catalogue } from "../lib/publication.server";
import { siteOrigin, xmlEscape } from "../lib/seo";
export async function loader() {
  const all = await catalogue();
  if (all.message || all.demo)
    return new Response("Sitemap temporarily unavailable.", { status: 503 });
  const paths = [
    "/",
    "/about",
    "/documents",
    "/documents/platform-notice",
    "/handbook",
    "/archive",
    ...all.issues
      .filter((i) => i.status !== "draft")
      .map((i) => "/issues/" + i.slug),
    ...all.features
      .filter(
        (f) =>
          f.status === "published" &&
          ["open_panel", "closing_panel", "final_panel", "archived"].includes(
            f.lifecycle_status,
          ),
      )
      .map((f) => "/features/" + f.slug),
  ];
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(paths)]
        .map((p) => "<url><loc>" + xmlEscape(siteOrigin + p) + "</loc></url>")
        .join("") +
      "</urlset>",
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
