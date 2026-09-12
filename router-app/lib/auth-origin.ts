import { safeReturnPath } from "./handbook";

export const PRODUCTION_ORIGIN = "https://komaplay.com";
export const CANARY_ORIGIN = "https://komaplay-canary.garetha81.workers.dev";

const DEPLOYED_AUTH_ORIGINS = new Set([PRODUCTION_ORIGIN, CANARY_ORIGIN]);

function isLocalAuthOrigin(url: URL) {
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

export function trustedAuthOrigin(value: string | URL | null | undefined) {
  if (!value) return PRODUCTION_ORIGIN;
  try {
    const url = value instanceof URL ? value : new URL(value);
    const origin = url.origin;
    if (DEPLOYED_AUTH_ORIGINS.has(origin) || isLocalAuthOrigin(url))
      return origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
  return PRODUCTION_ORIGIN;
}

export function requestAuthOrigin(request: Request) {
  return trustedAuthOrigin(new URL(request.url));
}

export function authCallbackUrl(origin: string, returnTo: unknown) {
  const callback = new URL("/auth/callback", trustedAuthOrigin(origin));
  callback.searchParams.set("returnTo", safeReturnPath(returnTo));
  return callback.toString();
}
