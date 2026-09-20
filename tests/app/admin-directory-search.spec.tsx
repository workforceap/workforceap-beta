import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), count: vi.fn(), getUser: vi.fn(), isAdmin: vi.fn(), auditLog: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isAdminInOrg: mocks.isAdmin, isSuperAdmin: async () => false }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-a' }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: mocks.findMany, count: mocks.count },
  partner: { findMany: async () => [] },
  memberEvent: { groupBy: async () => [] },
  courseProgress: { groupBy: async () => [] },
  memberProgramProgress: { findMany: async () => [] },
} }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/platform/programCatalog', () => ({ getActivePrograms: async () => [] }));
vi.mock('@/lib/admin/fitScore', () => ({ calculateFitScore: () => 0 }));
vi.mock('@/lib/admin/healthScore', () => ({ calculateHealthStatus: () => 'healthy' }));
vi.mock('@/components/admin/MembersTable', () => ({ default: () => null }));
vi.mock('@/components/admin/MembersListNav', () => ({ default: () => null }));
vi.mock('@/components/admin/AdminUsersManager', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/UsersKit', () => ({ UsersKit: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: () => null }));

import AdminMembersPage from '@/app/admin/members/page';
import AdminUsersPage from '@/app/admin/users/page';
import { GET as exportMembers } from '@/app/api/admin/members/export/route';
import AdminUsersManager from '@/components/admin/AdminUsersManager';
import { normalizeDirectorySearch, buildDirectorySearchWhere } from '@/lib/admin/directorySearch';

type RecordValue = Record<string, unknown>;
/** Evaluate the Prisma filter subset used by these directory fixture queries. */
function matches(value: unknown, where: unknown): boolean {
  if (where === null || typeof where !== 'object') return value === where;
  const filters = where as RecordValue;
  if ('contains' in filters) return typeof value === 'string' && value.toLowerCase().includes(String(filters.contains).toLowerCase());
  if ('in' in filters) return (filters.in as unknown[]).includes(value);
  if ('notIn' in filters) return !(filters.notIn as unknown[]).includes(value);
  if ('not' in filters) return !matches(value, filters.not);
  if ('gte' in filters && !(value instanceof Date && value >= (filters.gte as Date))) return false;
  if ('lte' in filters && !(value instanceof Date && value <= (filters.lte as Date))) return false;
  if ('some' in filters) return Array.isArray(value) && value.some((row) => matches(row, filters.some));
  if ('none' in filters) return Array.isArray(value) && !value.some((row) => matches(row, filters.none));
  if ('is' in filters) return matches(value, filters.is);
  return Object.entries(filters).every(([key, filter]) => {
    if (key === 'AND') return (Array.isArray(filter) ? filter : [filter]).every((entry) => matches(value, entry));
    if (key === 'OR') return (filter as unknown[]).some((entry) => matches(value, entry));
    if (key === 'gte' || key === 'lte') return true;
    return matches((value as RecordValue | null)?.[key], filter);
  });
}

function user(id: string, overrides: RecordValue = {}): RecordValue {
  return {
    id, fullName: 'Pat Jones', email: `pat${id}@example.test`, organizationId: 'org-a',
    profile: { role: 'counselor' }, userRoles: [], deletedAt: null, createdAt: new Date('2026-09-01'),
    lastLoginAt: null, updatedAt: new Date(), ...overrides,
  };
}

function propsFor(tree: ReactNode, component: unknown): RecordValue | undefined {
  if (!isValidElement(tree)) return undefined;
  const element = tree as ReactElement<RecordValue>;
  if (element.type === component) return element.props;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = propsFor(child as ReactNode, component);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  mocks.auditLog.mockResolvedValue(undefined);
});

describe('admin directory query composition', () => {
  it('normalizes pasted whitespace and matches all name/email tokens in any order', () => {
    const normalized = normalizeDirectorySearch('  Jones\n  PAT\t  ');
    expect(normalized).toBe('Jones PAT');
    const where = buildDirectorySearchWhere(normalized);
    expect(matches(user('1'), where)).toBe(true);
    expect(matches(user('2', { fullName: 'Jones', email: 'pat@example.test' }), where)).toBe(true);
    expect(matches(user('3', { fullName: 'Jones', email: 'other@example.test' }), where)).toBe(false);
  });

  it.each(['active', 'completed'])('combines %s status and search without replacing either OR', async (status) => {
    await AdminMembersPage({ searchParams: Promise.resolve({ search: ' Pat   Jones ', status, program: 'it-support', partner: 'partner-a' }) });
    const where = mocks.findMany.mock.calls[0][0].where;
    const matching = user('1', {
      profile: { role: 'member' },
      courseEnrollments: [{ programSlug: 'it-support' }],
      partnerReferrals: [{ partnerId: 'partner-a' }],
      userCertifications: [{}], courseProgress: [], memberEvents: [],
    });
    expect(matches(matching, where)).toBe(true);
    expect(matches({ ...matching, fullName: 'Someone Else', email: 'someone@example.test' }, where)).toBe(false);
    expect(matches({ ...matching, organizationId: 'org-b' }, where)).toBe(false);
    expect(matches({ ...matching, courseEnrollments: [] }, where)).toBe(false);
    expect(matches({ ...matching, partnerReferrals: [] }, where)).toBe(false);
    expect(matches({ ...matching, userCertifications: [], updatedAt: new Date('2020-01-01') }, where)).toBe(false);
    expect(mocks.count.mock.calls[0][0].where).toEqual(where);
  });

  it('keeps dropped-member search tenant-scoped and excludes active records', async () => {
    await AdminMembersPage({ searchParams: Promise.resolve({ search: 'Pat', status: 'dropped' }) });
    const where = mocks.findMany.mock.calls[0][0].where;
    const dropped = user('1', { profile: { role: 'member' }, deletedAt: new Date() });
    expect(matches(dropped, where)).toBe(true);
    expect(matches({ ...dropped, deletedAt: null }, where)).toBe(false);
    expect(matches({ ...dropped, organizationId: 'org-b' }, where)).toBe(false);
  });

  it.each([undefined, 'legacy'])('searches the full directory before pagination (ui=%s)', async (ui) => {
    const fixtures = [
      ...Array.from({ length: 65 }, (_, index) => user(String(index))),
      user('outsider', { organizationId: 'org-b' }),
      user('other-role', { profile: { role: 'employer' } }),
      user('not-matching', { fullName: 'Other Person', email: 'other@example.test' }),
    ];
    mocks.findMany.mockImplementation(async ({ where, skip, take }) => fixtures.filter((row) => matches(row, where)).slice(skip, skip + take));
    mocks.count.mockImplementation(async ({ where }) => fixtures.filter((row) => matches(row, where)).length);
    const tree = await AdminUsersPage({ searchParams: Promise.resolve({ ui, search: ' PAT   Jones ', role: 'counselor', page: '2' }) });
    const props = ui === 'legacy' ? propsFor(tree, AdminUsersManager)! : tree.props;
    const rows = (ui === 'legacy' ? props.initialUsers : props.users) as RecordValue[];
    expect(rows).toHaveLength(15);
    expect(rows[0].id).toBe('50');
    expect(rows.at(-1)?.id).toBe('64');
    expect(ui === 'legacy' ? props.totalCount : props.total).toBe(65);
    expect(props.searchQuery).toBe('PAT Jones');
    expect(props.currentPage).toBe(2);
    expect(props.pageSize).toBe(50);
    expect(props.roleFilter).toBe('counselor');
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 50, where: { organizationId: 'org-a' } });
  });

  it('finds a matching account beyond the first unfiltered page', async () => {
    const fixtures = [...Array.from({ length: 60 }, (_, index) => user(String(index))), user('target', { fullName: 'Morgan Lee', email: 'morgan@example.test' })];
    mocks.findMany.mockImplementation(async ({ where, skip, take }) => fixtures.filter((row) => matches(row, where)).slice(skip, skip + take));
    mocks.count.mockImplementation(async ({ where }) => fixtures.filter((row) => matches(row, where)).length);
    const tree = await AdminUsersPage({ searchParams: Promise.resolve({ search: '  Lee Morgan ' }) });
    expect(tree.props.users.map((row: { id: string }) => row.id)).toEqual(['target']);
    expect(tree.props.total).toBe(1);
  });

  it('does not widen the staff roster to members through a role query parameter', async () => {
    await AdminUsersPage({ searchParams: Promise.resolve({ role: 'member', search: 'Pat' }) });
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(matches(user('1'), where)).toBe(true);
    expect(matches(user('2', { profile: { role: 'member' } }), where)).toBe(false);
  });

  it('redirects non-admins before directory queries', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    await expect(AdminUsersPage({})).rejects.toThrow('REDIRECT:/dashboard');
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('exports a status-and-name match beyond the first 5,000 unfiltered records', async () => {
    const member = user('target', {
      fullName: 'Morgan Lee', email: 'morgan@example.test', profile: { role: 'member' },
      enrolledProgram: null, enrolledAt: null, courseEnrollments: [], partnerReferrals: [],
      userCertifications: [{}], courseProgress: [], placementRecord: null,
    });
    const fixtures = [
      ...Array.from({ length: 5000 }, (_, index) => ({ ...member, id: String(index), fullName: 'Other Person', email: `other${index}@example.test` })),
      member,
      { ...member, id: 'wrong-tenant', organizationId: 'org-b', email: 'foreign@example.test' },
      { ...member, id: 'not-completed', userCertifications: [], email: 'incomplete@example.test' },
    ];
    mocks.findMany.mockImplementation(async ({ where, take }) => fixtures.filter((row) => matches(row, where)).slice(0, take));
    const response = await exportMembers(new Request('https://workforceap.org/api/admin/members/export?search=Lee%20%20Morgan&status=completed'));
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv.trim().split('\n')).toHaveLength(2);
    expect(csv).toContain('morgan@example.test');
    expect(csv).not.toContain('foreign@example.test');
    expect(csv).not.toContain('incomplete@example.test');
    expect(mocks.findMany.mock.calls[0][0].take).toBe(5000);
    expect(mocks.auditLog.mock.calls[0][0].metadata).toMatchObject({ rowCount: 1, truncated: false, filters: { search: 'Lee Morgan', status: 'completed' } });
  });

  it('keeps export and page search, status, program, partner, and dates equivalent', async () => {
    const filters = { search: 'Pat Jones', status: 'dropped', program: 'it-support', partner: 'partner-a', startDate: '2026-08-01', endDate: '2026-09-01' };
    await AdminMembersPage({ searchParams: Promise.resolve(filters) });
    const pageWhere = mocks.findMany.mock.calls[0][0].where;
    mocks.findMany.mockClear();
    const response = await exportMembers(new Request(`https://workforceap.org/api/admin/members/export?${new URLSearchParams(filters)}`));
    expect(response.status).toBe(200);
    const exportWhere = mocks.findMany.mock.calls[0][0].where;
    const member = user('1', { profile: { role: 'member' }, deletedAt: new Date(), enrolledAt: new Date('2026-08-15'),
      courseEnrollments: [{ programSlug: 'it-support' }], partnerReferrals: [{ partnerId: 'partner-a' }],
    });
    for (const candidate of [member, { ...member, deletedAt: null }, { ...member, organizationId: 'org-b' }, { ...member, enrolledAt: new Date('2025-01-01') }, { ...member, courseEnrollments: [] }, { ...member, partnerReferrals: [] }]) {
      expect(matches(candidate, exportWhere)).toBe(matches(candidate, pageWhere));
    }
    expect(matches(member, exportWhere)).toBe(true);
  });
});
