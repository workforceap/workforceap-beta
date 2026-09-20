import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import PageHeader from '@/components/portal/PageHeader';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import AdminUsersManager from '@/components/admin/AdminUsersManager';
import { buildUserDirectoryWhere, normalizeDirectorySearch, STAFF_DIRECTORY_ROLES, USER_DIRECTORY_ROLES } from '@/lib/admin/directorySearch';
import { resolveDirectoryRole } from '@/lib/admin/roleLabels';
import {
  UsersKit,
  type UserRow,
} from '@/components/portal/kit/pages/admin-subviews/UsersKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Users',
    description: 'Manage user emails, roles, and password resets.',
    path: '/admin/users',
  });
}

/** Human-readable role labels for the roster. */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  case_manager: 'Case Manager',
  counselor: 'Counselor',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build initials from a full name (e.g. "Sarah Chen" → "SC"). */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Relative last-login caption, e.g. "Now", "2h ago", "1d ago", "Never". */
function lastLoginCaption(at: Date | null): string {
  if (!at) return 'Never';
  const diffMs = Date.now() - at.getTime();
  if (diffMs < 0) return 'Now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 2) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** A login within this window keeps the account flagged "Active". */
const ACTIVE_IDLE_DAYS = 90;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/users');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  const requestedUi = typeof params.ui === 'string' ? params.ui : null;
  const searchQuery = typeof params.search === 'string' ? normalizeDirectorySearch(params.search) : '';
  const allowedRoles: readonly string[] = requestedUi === 'legacy' ? USER_DIRECTORY_ROLES : STAFF_DIRECTORY_ROLES;
  const roleFilter = typeof params.role === 'string' && allowedRoles.includes(params.role) ? params.role : '';
  const pageParam = typeof params.page === 'string' ? Number(params.page) : 1;
  const currentPage = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const pageSize = 50;
  const where = buildUserDirectoryWhere({ searchQuery, roleFilter, staffOnly: requestedUi !== 'legacy' });

  // Legacy → the original full CRUD manager (quick create, edit, reset, delete).
  if (requestedUi === 'legacy') {
    const [users, canManageRoles, deletedCount, totalCount] = await Promise.all([
      withAdminPageScope(scope, (db) =>
        db.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            fullName: true,
            email: true,
            createdAt: true,
            profile: { select: { role: true } },
            userRoles: { select: { role: { select: { name: true } } } },
          },
        }),
      ),
      isSuperAdmin(user.id),
      withAdminPageScope(scope, (db) => db.user.count({ where: { deletedAt: { not: null } } })),
      withAdminPageScope(scope, (db) => db.user.count({ where })),
    ]);

    return (
      <PortalPageFrame>
        <PageHeader
          title="Users"
          subtitle="Manage emails, password resets, and admin access from one place."
          action={
            <Link
              href="/admin/users/deleted"
              className="btn btn-muted btn-small"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Trash2 size={14} aria-hidden />
              Deleted{deletedCount > 0 ? ` (${deletedCount})` : ''}
            </Link>
          }
        />

        <AdminUsersManager
          canManageRoles={canManageRoles}
          currentUserId={user.id}
          totalCount={totalCount}
          currentPage={currentPage}
          pageSize={pageSize}
          searchQuery={searchQuery}
          roleFilter={roleFilter}
          initialUsers={users.map((row) => {
            // Partner / employer demo logins carry only a user_roles row, so the
            // displayed role comes from profile + user_roles, not profile alone.
            const role = resolveDirectoryRole(
              row.profile?.role,
              row.userRoles.map((entry) => entry.role.name),
            );
            return {
              id: row.id,
              fullName: row.fullName ?? row.email,
              email: row.email,
              role,
              createdAt: row.createdAt.toISOString(),
              memberHref: role === 'member' ? `/admin/members/${row.id}` : null,
            };
          })}
        />
      </PortalPageFrame>
    );
  }

  // --- DEFAULT: real (lean) staff accounts roster (design kit) ---
  // Filter to staff/admin/counselor roles only — NOT all members.
  const [[staffResult, totalCount], canManageRoles] = await Promise.all([
    withAdminPageScope(scope, (db) => Promise.all([
      db.user.findMany({
        take: pageSize,
        skip: (currentPage - 1) * pageSize,
        where,
        orderBy: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          fullName: true,
          email: true,
          lastLoginAt: true,
          profile: { select: { role: true } },
        },
      }),
      db.user.count({ where }),
    ])),
    isSuperAdmin(user.id),
  ]);

  const activeCutoff = new Date();
  activeCutoff.setDate(activeCutoff.getDate() - ACTIVE_IDLE_DAYS);

  const users: UserRow[] = staffResult.map((row) => {
    const name = row.fullName?.trim() || row.email;
    const role = row.profile?.role ?? 'member';
    const lastLoginAt = row.lastLoginAt;
    return {
      id: row.id,
      name,
      initials: initialsFrom(name),
      email: row.email,
      role: roleLabel(role),
      roleCode: role,
      lastLogin: lastLoginCaption(lastLoginAt),
      active: !!lastLoginAt && lastLoginAt >= activeCutoff,
    };
  });

  return (
    <UsersKit
      users={users}
      total={totalCount}
      currentPage={currentPage}
      pageSize={pageSize}
      searchQuery={searchQuery}
      roleFilter={roleFilter}
      currentUserId={user.id}
      canManageRoles={canManageRoles}
    />
  );
}
