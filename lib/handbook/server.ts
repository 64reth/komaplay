import type { SupabaseClient } from "@supabase/supabase-js";
import { serverClient } from "../supabase/server";
import { HttpError } from "../open-panel/errors";
import {
  needsOnboarding,
  onboardingHref,
  type HandbookState,
  type HandbookVersion,
  type HandbookAcceptance,
} from "./domain";
export class OnboardingRequired extends HttpError {
  readonly onboardingUrl: string;
  constructor(returnTo: unknown) {
    super(
      428,
      "Read and accept the current community handbook before participating.",
    );
    this.onboardingUrl = onboardingHref(returnTo);
  }
}
export async function handbookState(
  db: SupabaseClient,
  userId?: string,
): Promise<HandbookState> {
  try {
    const { data: version, error } = await db
      .from("handbook_versions")
      .select("*")
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!version)
      return {
        status: "unavailable",
        version: null,
        acceptance: null,
        message:
          "No handbook version is active. An administrator needs to activate a prepared version.",
      };
    let acceptance: HandbookAcceptance | null = null;
    if (userId) {
      const result = await db
        .from("handbook_acceptances")
        .select("user_id,handbook_version_id,accepted_at,statement_version")
        .eq("user_id", userId)
        .eq("handbook_version_id", version.id)
        .maybeSingle();
      if (result.error) throw result.error;
      acceptance = result.data;
    }
    return {
      status: needsOnboarding(version, acceptance) ? "required" : "accepted",
      version: version as HandbookVersion,
      acceptance,
    };
  } catch {
    return {
      status: "unavailable",
      version: null,
      acceptance: null,
      message:
        "The community handbook could not be checked. Please retry; participation is paused until it can be verified.",
    };
  }
}
export async function publicHandbook() {
  const db = await serverClient();
  if (!db)
    return {
      status: "unavailable",
      version: null,
      acceptance: null,
      message:
        "Development setup: connect Supabase and apply the handbook migration to record acceptance.",
    } satisfies HandbookState;
  return handbookState(db);
}
export async function requireHandbook(
  db: SupabaseClient,
  userId: string,
  returnTo: unknown = "/",
) {
  const state = await handbookState(db, userId);
  if (state.status === "unavailable") throw new HttpError(503, state.message!);
  if (state.status !== "accepted") throw new OnboardingRequired(returnTo);
  return state;
}
