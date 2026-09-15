export function loader() {
  return new Response(
    "User-agent: *\nDisallow: /editorial\nDisallow: /moderation\nDisallow: /profile\nDisallow: /onboarding\nDisallow: /auth/\nDisallow: /member/\nDisallow: /api/\nDisallow: /*/workshop\nDisallow: /*/correction\nSitemap: https://komaplay.com/sitemap.xml\n",
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
