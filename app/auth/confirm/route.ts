import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "../../../lib/supabase/server";
import { safeReturnPath } from "../../../lib/handbook/domain";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next =
    request.nextUrl.searchParams.get("next") ?? "/features/tokon/workshop";
  const safe = safeReturnPath(next, "/onboarding");
  const db = await serverClient();
  if (db && code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, request.url));
  }
  return NextResponse.redirect(
    new URL(`${safe}?auth_error=expired`, request.url),
  );
}
