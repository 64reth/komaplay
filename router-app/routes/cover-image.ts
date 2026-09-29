// Legacy storage-path URLs are closed. Public covers use /api/public-media/:reference.
export async function loader() {
  return new Response("Cover image unavailable.", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
