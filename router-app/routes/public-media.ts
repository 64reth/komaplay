import type { Route } from "./+types/public-media";
import { publicMediaResponse } from "../lib/public-media.server";
export async function loader({ params }: Route.LoaderArgs) {
  return publicMediaResponse(params.reference);
}
