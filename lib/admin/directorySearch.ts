import type { Prisma } from '@prisma/client';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';

/** Share normalized name/email matching between full directories and quick search. */
export function normalizeDirectorySearch(value: string): string {
  return value.replace(/\0/g, '').trim().replace(/\s+/g, ' ').slice(0, 200).trim();
}

export function buildDirectorySearchWhere(query: string): Prisma.UserWhereInput {
  const normalized = normalizeDirectorySearch(query);
  if (!normalized) return {};
  return {
    AND: normalized.split(' ').map((token) => ({
      OR: [
        { fullName: { contains: token, mode: 'insensitive' } },
        { email: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

export const STAFF_DIRECTORY_ROLES = ['admin', 'super_admin', 'case_manager', 'counselor'] as const;
export const USER_DIRECTORY_ROLES = [...STAFF_DIRECTORY_ROLES, 'member', 'employer', 'partner'] as const;

export function buildUserDirectoryWhere(options: {
  searchQuery: string;
  roleFilter: string;
  staffOnly: boolean;
}): Prisma.UserWhereInput {
  const allowedRoles: readonly string[] = options.staffOnly ? STAFF_DIRECTORY_ROLES : USER_DIRECTORY_ROLES;
  const role = allowedRoles.includes(options.roleFilter) ? options.roleFilter : '';
  const roleWhere: Prisma.UserWhereInput = role === 'member'
    // "Member" is the one definition (lib/admin/memberOnlyWhere.ts): a member
    // row in user_roles or profiles.role = 'member', minus staff-by-profile —
    // the same people /admin/members lists. Role half only: this is a
    // directory, so QA accounts stay findable.
    ? { NOT: MEMBER_ONLY_ROLE_NOT }
    : role
      ? { profile: { role } }
      : options.staffOnly
        ? { profile: { role: { in: [...STAFF_DIRECTORY_ROLES] } } }
        : {};
  return {
    deletedAt: null,
    AND: [buildDirectorySearchWhere(options.searchQuery), roleWhere],
  };
}
