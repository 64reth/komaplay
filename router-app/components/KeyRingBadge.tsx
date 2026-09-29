import { useRouteLoaderData } from "react-router";
import { keyRingAccess, type KeyRingAccess } from "../lib/role-classification";
import type { AuthSnapshot } from "../lib/auth";
const counts = {
  member: 1,
  "editorial-contributor": 2,
  moderator: 3,
  admin: 4,
} as const;
export function KeyRingBadge({
  access,
  profile = false,
}: {
  access: KeyRingAccess;
  profile?: boolean;
}) {
  const count = counts[access.badge];
  return (
    <span
      className={`key-ring-badge${profile ? " key-ring-profile" : ""}`}
      title={access.tooltip}
    >
      <img
        src={`/assets/keyring-badges/keyring_badge_${count}key.png`}
        width={profile ? 48 : 40}
        height={profile ? 48 : 40}
        alt={`${count} ${count === 1 ? "key" : "keys"} · ${access.tooltip}`}
      />
    </span>
  );
}
// Only used in the current user's private identity surfaces, never public attribution.
export function MyKeyRing({ profile = false }: { profile?: boolean }) {
  const root = useRouteLoaderData("root") as
    { auth: AuthSnapshot; capabilities?: { editorial: boolean } } | undefined;
  if (
    root?.auth.state !== "authenticated" ||
    root.auth.member.accountStatus !== "active"
  )
    return null;
  return (
    <KeyRingBadge
      profile={profile}
      access={keyRingAccess(
        root.auth.member.role,
        root.capabilities?.editorial,
      )}
    />
  );
}
