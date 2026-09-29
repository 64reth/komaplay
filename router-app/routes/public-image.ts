// Legacy owner-path URLs are intentionally unavailable publicly. Private Workshop
// previews still use the authenticated /member/workshop/image endpoint.
export async function loader() {
  return new Response("Published image unavailable.", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
