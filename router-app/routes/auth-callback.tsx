import type { Route } from "./+types/auth-callback";
import { supabaseServer } from "../lib/supabase.server";
import { completeAuthentication } from "../lib/auth-callback.server";

export async function loader({ request }: Route.LoaderArgs) {
  return completeAuthentication(request, supabaseServer(request));
}
