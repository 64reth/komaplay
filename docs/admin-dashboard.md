# Admin dashboard

`/admin` is an active-admin-only member directory and permission console. It uses the existing `profiles.role`, `editorial_access_grants`, `role_audit`, and grant RPCs; no client-side permission check authorises a mutation.

## Existing access levels

- **Member:** community profile and Workshop access. The stored `contributor` role is a legacy member-level classification and adds no tools.
- **Editorial Contributor:** an active `editor` grant; can create and submit canonical panels.
- **Moderator:** the existing `profiles.role = 'moderator'`; can create panels, review other people's submissions, moderate Open Panel work and publish approved panels. Reviewer and publisher are bundled in the current database model.
- **Admin:** `profiles.role = 'admin'`; the highest current tier, inheriting editorial, review, moderation and publishing access and managing permissions. There is no separate Owner role.
- **Legacy editorial reviewer/publisher:** old `administrator` entries in `editorial_access_grants` confer canonical review and publishing access but are not site Admin authority or Open Panel moderation.

No role can approve its own canonical panel or Open Panel submission. Those checks remain inside the database RPCs.

## Granting reviewer access

Sign in with an active admin account, open **ADMIN** from the account menu, search for the member by email or display name, choose **Moderator**, tick the elevated-access confirmation, and update the role. Moderator already includes canonical authoring, review, Open Panel moderation and publishing. Use **Grant Editorial Contributor** alone when the member should author canonical panels without reviewing or publishing.

## Production verification

1. Confirm ADMIN appears for an admin and not a moderator.
2. Confirm a direct `/admin` visit gives non-admins a helpful denied state.
3. Find the target account, grant moderator, and confirm the audit row is recorded.
4. Sign in as that reviewer: confirm Review Inbox access, approval of another author's panel, and rejection of self-approval.
5. Revoke the role and confirm review access disappears.

## Rollback

Roll back the Worker deployment, then remove only `admin_member_directory` if database rollback is required. The migration is additive and stores no new data. Role/grant changes are independently reversible through the same audited admin controls; do not delete audit history.
