import type { USER_DIRECTORY_ROLES } from './directorySearch';
import { ROLE_PRECEDENCE } from '@/lib/auth/roleAccess';

const ROLE_LABELS: Record<(typeof USER_DIRECTORY_ROLES)[number], string> = {
  member: 'Member',
  admin: 'Admin',
  super_admin: 'Super admin',
  case_manager: 'Case manager',
  counselor: 'Counselor',
  employer: 'Employer',
  partner: 'Partner',
};

/** Presentation only: keep stored role codes and submitted option values intact. */
export function directoryRoleLabel(role: string): string {
  const key = role.trim().toLowerCase().replace(/\s+/g, '_');
  return ROLE_LABELS[key as keyof typeof ROLE_LABELS]
    ?? role.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

/**
 * Most-privileged-first order for accounts that carry more than one role row:
 * the shared `ROLE_PRECEDENCE` that role resolution uses (WAP-182 item 1),
 * minus the `member` baseline this function falls back to anyway.
 */
const DIRECTORY_ROLE_PRECEDENCE: readonly string[] = ROLE_PRECEDENCE.filter((role) => role !== 'member');

/**
 * The role the admin directory displays for an account (admin audit §4.7,
 * WAP-182). `Profile.role` wins when it names a staff or partner-side role.
 * Demo partner / employer logins are seeded with only a `user_roles` row and
 * no profile, so a `profile?.role ?? 'member'` fallback labelled them
 * "Member"; here the `UserRole` names decide before falling back to member.
 */
export function resolveDirectoryRole(
  profileRole: string | null | undefined,
  userRoleNames: readonly string[] = [],
): string {
  const normalizedProfile = profileRole?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
  if (normalizedProfile && normalizedProfile !== 'member') return normalizedProfile;
  const normalizedRoles = userRoleNames.map((role) => role.trim().toLowerCase().replace(/\s+/g, '_'));
  for (const role of DIRECTORY_ROLE_PRECEDENCE) {
    if (normalizedRoles.includes(role)) return role;
  }
  return 'member';
}
