# Admin dashboard

`/admin` is an active-admin-only member directory and permission console. It uses the existing `profiles.role`, `editorial_access_grants`, `role_audit`, and grant RPCs; no client-side permission check authorises a mutation.

## Existing access levels

- **Member / contributor:** community profile and Workshop access.
- **Editor:** an active `editorial_access_grants` record; can create and edit canonical panels.
- **Moderator:** the existing `profiles.role = 'moderator'`; can review other people's submissions and publish approved work. The current production schema intentionally combines reviewer and publisher duties in this role.
- **Admin / owner:** `profiles.role = 'admin'`; inherits editorial, review, moderation and publishing access and can manage permissions.
- **Legacy reviewer grant:** old `administrator` entries in `editorial_access_grants` confer review access but are not site-admin authority. The dashboard identifies them without renaming or escalating them.

No role can approve its own canonical panel or Open Panel submission. Those checks remain inside the database RPCs.

## Granting reviewer access

Sign in with an active admin account, open **ADMIN** from the account menu, search for the member by email or display name, choose **Moderator / reviewer / publisher**, tick the elevated-access confirmation, and update the role. Use **Grant editor** as well only if the member needs to author canonical panels.

## Production verification

1. Confirm ADMIN appears for an admin and not a moderator.
2. Confirm a direct `/admin` visit gives non-admins a helpful denied state.
3. Find the target account, grant moderator, and confirm the audit row is recorded.
4. Sign in as that reviewer: confirm Review Inbox access, approval of another author's panel, and rejection of self-approval.
5. Revoke the role and confirm review access disappears.

## Rollback

Roll back the Worker deployment, then remove only `admin_member_directory` if database rollback is required. The migration is additive and stores no new data. Role/grant changes are independently reversible through the same audited admin controls; do not delete audit history.
