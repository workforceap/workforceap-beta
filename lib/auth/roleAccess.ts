/** Profile.role or UserRole.name both grant platform super-admin. */
export function hasSuperAdminAccess(profileRole: string, userRoleNames: readonly string[]): boolean {
  return profileRole === 'super_admin' || userRoleNames.includes('super_admin');
}

export function hasAdminAccess(profileRole: string, userRoleNames: readonly string[]): boolean {
  return (
    profileRole === 'admin' ||
    profileRole === 'super_admin' ||
    userRoleNames.includes('admin') ||
    userRoleNames.includes('super_admin')
  );
}

/**
 * Most-privileged-first order for accounts that carry more than one
 * `user_roles` row (WAP-182 item 1). The admin directory displays the same
 * order (`lib/admin/roleLabels.ts`). `member` is the baseline row that
 * `ensureAppUser` grants to every account, so it ranks last.
 */
export const ROLE_PRECEDENCE = [
  'super_admin',
  'admin',
  'case_manager',
  'counselor',
  'employer',
  'partner',
  'member',
] as const;

const KNOWN_ROLES: ReadonlySet<string> = new Set(ROLE_PRECEDENCE);

/** `'Super Admin'` -> `'super_admin'`; null/undefined -> `''`. */
export function normalizeRoleName(role: string | null | undefined): string {
  return role?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

export type RoleResolutionInput = {
  /** `users.deleted_at`; a soft-deleted account resolves to `member`. */
  deletedAt: Date | null | undefined;
  /** `profiles.role`, the legacy single-role column. */
  profileRole: string | null | undefined;
  /** `roles.name` for each of the user's `user_roles` rows. */
  userRoleNames: readonly string[];
};

export type RoleResolution = {
  role: string;
  /** Which store decided the role; `profile` is the fallback the resolver logs. */
  source: 'deleted' | 'user_roles' | 'profile' | 'default';
};

/**
 * Pure role resolution with `user_roles` as the source of truth (WAP-182
 * item 1). Precedence, in order:
 *
 *  1. A soft-deleted user (`deletedAt` set) is `member`: no privilege survives
 *     deletion, whatever either store still says.
 *  2. `profiles.role === 'super_admin'` stays `super_admin` even when the
 *     rows name a lesser role. This is the one profile-first exception:
 *     nothing in the codebase writes `super_admin` into `user_roles`
 *     (`syncManagedUserRoles` manages only `admin` and `case_manager`, and
 *     the seed sets it on the profile only), so a user_roles-only rule would
 *     demote every platform super-admin to whatever row they happen to hold.
 *     The backfill script lists these accounts as conflicts for WAP-182
 *     item 2; once a `super_admin` row exists this branch is a no-op.
 *  3. Otherwise the `user_roles` rows other than `member` decide. Every
 *     account carries a baseline `member` row (`ensureAppUser`,
 *     `createMember`, invite accept), and some promotions still write only
 *     `profiles.role` (POST /api/admin/counselors), so a lone `member` row
 *     says nothing about privilege and must not mask the profile. One
 *     recognised non-member row is the role; several pick the most
 *     privileged by `ROLE_PRECEDENCE`. Names outside `ROLE_PRECEDENCE` are
 *     ignored (they carry no portal access).
 *  4. No non-member row: fall back to `profiles.role` (normalised), which
 *     `getProfileRole` logs once at debug level.
 *  5. Nothing anywhere: `member`.
 */
export function resolveEffectiveRole(input: RoleResolutionInput): RoleResolution {
  if (input.deletedAt) return { role: 'member', source: 'deleted' };

  const profileRole = normalizeRoleName(input.profileRole);
  const rows = input.userRoleNames
    .map(normalizeRoleName)
    .filter((name) => KNOWN_ROLES.has(name) && name !== 'member');

  if (profileRole === 'super_admin' && !rows.includes('super_admin')) {
    return { role: 'super_admin', source: 'profile' };
  }

  const fromRows = ROLE_PRECEDENCE.find((role) => rows.includes(role));
  if (fromRows) return { role: fromRows, source: 'user_roles' };

  if (profileRole) return { role: profileRole, source: 'profile' };
  return { role: 'member', source: 'default' };
}
