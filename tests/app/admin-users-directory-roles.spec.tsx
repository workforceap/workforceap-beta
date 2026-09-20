import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Admin audit §4.7 (WAP-182): /admin/users?ui=legacy labels every account by
 * its real role. Demo partner / employer logins are seeded with a user_roles
 * row and no profile, so the page resolves the displayed role from profile
 * AND user_roles (`resolveDirectoryRole`) instead of `profile?.role ?? 'member'`,
 * and hands the manager the signed-in admin's id for the self-row guard.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, organizationId: 'org-a' })),
  withAdminPageScope: vi.fn(async (_scope: unknown, fn: (db: unknown) => unknown) =>
    fn({ user: { findMany: mocks.findMany, count: mocks.count } }),
  ),
}));
vi.mock('@/components/admin/AdminUsersManager', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/UsersKit', () => ({ UsersKit: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: () => null }));

import AdminUsersPage from '@/app/admin/users/page';
import AdminUsersManager from '@/components/admin/AdminUsersManager';
import { resolveDirectoryRole } from '@/lib/admin/roleLabels';

type ManagerProps = {
  currentUserId?: string;
  canManageRoles: boolean;
  initialUsers: Array<{ id: string; role: string; memberHref: string | null }>;
};

function propsFor(tree: ReactNode, component: unknown): ManagerProps | undefined {
  if (!isValidElement(tree)) return undefined;
  const element = tree as ReactElement<Record<string, unknown>>;
  if (element.type === component) return element.props as unknown as ManagerProps;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = propsFor(child as ReactNode, component);
    if (found) return found;
  }
  return undefined;
}

type Fixture = {
  id: string;
  fullName: string | null;
  email: string;
  createdAt: Date;
  profile: { role: string } | null;
  userRoles: Array<{ role: { name: string } }>;
};

function fixture(id: string, profile: string | null, roleNames: string[]): Fixture {
  return {
    id,
    fullName: `${id} name`,
    email: `${id}@example.com`,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    profile: profile ? { role: profile } : null,
    userRoles: roleNames.map((name) => ({ role: { name } })),
  };
}

describe('resolveDirectoryRole', () => {
  it('prefers a staff or partner-side profile role', () => {
    expect(resolveDirectoryRole('counselor', ['partner'])).toBe('counselor');
    expect(resolveDirectoryRole('Super Admin', [])).toBe('super_admin');
  });

  it('falls back to user_roles when the profile is missing or says member', () => {
    expect(resolveDirectoryRole(null, ['partner'])).toBe('partner');
    expect(resolveDirectoryRole(undefined, ['employer'])).toBe('employer');
    expect(resolveDirectoryRole('member', ['employer'])).toBe('employer');
    expect(resolveDirectoryRole('member', ['case_manager'])).toBe('case_manager');
  });

  it('ranks the most privileged role first and defaults to member', () => {
    expect(resolveDirectoryRole('member', ['partner', 'admin'])).toBe('admin');
    expect(resolveDirectoryRole('member', ['employer', 'super_admin'])).toBe('super_admin');
    expect(resolveDirectoryRole('member', [])).toBe('member');
    expect(resolveDirectoryRole(null, [])).toBe('member');
    expect(resolveDirectoryRole('member', ['unknown_role'])).toBe('member');
  });
});

describe('/admin/users?ui=legacy role labels and self guard wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      fixture('demo-partner', null, ['partner']),
      fixture('demo-employer', 'member', ['employer']),
      fixture('counselor-1', 'counselor', []),
      fixture('member-1', 'member', []),
      fixture('admin-1', 'super_admin', ['super_admin']),
    ]);
    mocks.count.mockResolvedValue(5);
  });

  it('hands the manager real roles for partner and employer demo accounts', async () => {
    const tree = await AdminUsersPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });
    const props = propsFor(tree, AdminUsersManager);
    if (!props) throw new Error('AdminUsersManager not rendered');
    const byId = new Map(props.initialUsers.map((row) => [row.id, row]));
    expect(byId.get('demo-partner')).toMatchObject({ role: 'partner', memberHref: null });
    expect(byId.get('demo-employer')).toMatchObject({ role: 'employer', memberHref: null });
    expect(byId.get('counselor-1')).toMatchObject({ role: 'counselor', memberHref: null });
    expect(byId.get('member-1')).toMatchObject({ role: 'member', memberHref: '/admin/members/member-1' });
    expect(byId.get('admin-1')).toMatchObject({ role: 'super_admin', memberHref: null });
    expect(props.initialUsers.filter((row) => row.role === 'member')).toHaveLength(1);

    // The signed-in admin is identified so their own row loses Delete / role change.
    expect(props.currentUserId).toBe('admin-1');
    expect(props.canManageRoles).toBe(true);
  });

  it('asks the database for user_roles names alongside the profile role', async () => {
    await AdminUsersPage({ searchParams: Promise.resolve({ ui: 'legacy' }) });
    const select = mocks.findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).toMatchObject({
      profile: { select: { role: true } },
      userRoles: { select: { role: { select: { name: true } } } },
    });
  });
});
