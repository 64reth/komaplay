import type { KeyRingAccess } from "../lib/role-classification";

export function KeyRingBadge({ access }: { access: KeyRingAccess }) {
  return <span className="key-ring-badge" title={access.tooltip} aria-label={access.tooltip}>
    <img src={`/assets/badges/key-ring-${access.badge}.svg`} alt="" aria-hidden="true" />
  </span>;
}
