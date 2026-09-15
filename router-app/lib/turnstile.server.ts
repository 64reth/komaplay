export function turnstileSiteKey() {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET
    ? process.env.TURNSTILE_SITE_KEY
    : null;
}
export async function verifyEditorialChallenge(
  token: unknown,
  request: Request,
  fetcher: typeof fetch = fetch,
) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret && !process.env.TURNSTILE_SITE_KEY) return true;
  if (
    !secret ||
    !process.env.TURNSTILE_SITE_KEY ||
    typeof token !== "string" ||
    !token ||
    token.length > 2048
  )
    return false;
  const hostname = new URL(request.url).hostname;
  const allowed = String(process.env.TURNSTILE_HOSTNAMES ?? "komaplay.com")
    .split(",")
    .map((s) => s.trim());
  if (
    !allowed.includes(hostname) ||
    (hostname === "komaplay.com" &&
      allowed.some((h) => ["localhost", "127.0.0.1"].includes(h)))
  )
    return false;
  try {
    const response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    return (
      result.success === true &&
      result.action === "editorial-submit" &&
      result.hostname === hostname
    );
  } catch {
    return false;
  }
}
