# KOMA://PLAY role model audit

Audited against the production-lineage migrations, RLS policies, RPCs, server capability resolver, admin dashboard, Editorial and Moderation routes, and regression tests on 23 September 2026.

## Current database classifications

`profiles.role` is the site-role field. Its allowed values are:

| Stored value | Actual effect |
| --- | --- |
| `member` | Active member. Can accept the Pocket Guide and submit Open Panel contributions. |
| `contributor` | Legacy community classification. It currently grants no tool capability beyond `member`; it does **not** grant Editorial Dashboard access. |
| `moderator` | Bundled operational role. Inherits editorial authoring, canonical review and publication, plus Open Panel moderation. |
| `admin` | Top and only administrative role. Inherits moderator/editorial operations and can manage accounts, roles, grants and handbook administration. |

There is no separate `owner` database role or owner capability.

`editorial_access_grants.access_level` is a separate, revocable global grant:

| Stored value | Actual effect |
| --- | --- |
| `editor` | Editorial Dashboard access; create, edit and submit canonical panels. |
| `administrator` | Legacy editorial grant. Includes canonical editorial review and publication, but is **not** site-admin or owner access and does not satisfy the Open Panel RPC's moderator-role check. |

Account status (`active`, `restricted`, `suspended`) is an independent safety gate, not a role. Pocket Guide acceptance and publication lifecycle status are also independent prerequisites, not user classifications.

## Capability map

| Capability | Enforced by |
| --- | --- |
| Open Panel Workshop submission | Authenticated active member, current Pocket Guide acceptance, feature state and contribution RPC validation. All four profile roles qualify. |
| Editorial Dashboard / canonical panel creation | `editorial_has_access(..., false)`: active `moderator`/`admin`, or any active editorial grant (`editor` or legacy `administrator`). |
| Canonical review / approval | `editorial_has_access(..., true)`: active `moderator`/`admin`, or legacy `administrator` grant. Four-eyes RPC blocks author/submitter self-approval. |
| Canonical publication / takedown / archive | The same `editorial_has_access(..., true)` check. Reviewer and publisher are therefore bundled under the current model. Publication additionally requires the correct approved lifecycle state. |
| Open Panel review and incorporation | `profiles.role in ('moderator','admin')`. Four-eyes checks require an independent actor. |
| Admin Dashboard and user/role management | Active `profiles.role = 'admin'` only. Server/RPC enforced and audited. |

## Terminology findings

- **Editor** exists as the `editor` editorial grant, in editorial RPC messages and throughout Editorial UI/tests. It means canonical panel authoring, not moderation or site administration.
- **Contributor** is overloaded. Open Panel authors are community contributors, while the stored `contributor` profile role has no additional permission. Canonical panel creators are currently `editor` grantees, not `contributor` roles.
- **Reviewer and publisher are not separate capabilities** under the current canonical editorial RPCs. Both use the review-level access check.
- **Moderator** is the real bundled site role for review, publication and Open Panel operations.
- **Admin and owner are not separate**. `admin` is the only top-level authority; “owner” is product language only and should not be shown as a current role.

## Recommended classification

Do not add roles. Present the live model as four understandable classifications while keeping grants explicit:

1. **Member** — can join KOMA and submit Open Panel contributions. Treat the stored legacy `contributor` role as a member-level legacy classification, not an editorial permission.
2. **Editorial Contributor** — an `editor` grant layered on a member; can create and submit canonical panels.
3. **Moderator** — the existing bundled role; can create panels, review other people's work, moderate Open Panel contributions and publish approved panels. Cannot self-approve.
4. **Admin** — the existing top role; inherits operational tools and manages users and site settings. Cannot self-approve.

Do not advertise separate Publisher or Owner tiers until the database and RPCs enforce them independently. Identify old `administrator` editorial grants as **Legacy editorial reviewer/publisher**, never as Admin.
