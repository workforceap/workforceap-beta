/**
 * Self-row guard for the admin Users directory (admin audit §4.7, WAP-182).
 *
 * The signed-in admin never gets Delete or a role change on their own row:
 * the API refuses a self-delete with 400, and demoting yourself locks you out
 * of the page. Both the kit roster (`UsersKit`) and the legacy manager keep
 * the controls visible but inert, with these titles as the reason.
 */
export const SELF_DELETE_BLOCKED_TITLE = 'You cannot delete the account you are signed in with.';
export const SELF_ROLE_CHANGE_BLOCKED_TITLE = 'You cannot change your own role. Ask another super admin.';

export function isSelfRow(currentUserId: string | undefined, userId: string): boolean {
  return Boolean(currentUserId) && userId === currentUserId;
}
