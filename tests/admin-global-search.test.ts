// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), isSuperAdmin: vi.fn(), getActorOrganizationId: vi.fn(),
  user: vi.fn(), employer: vi.fn(), partner: vi.fn(), job: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: mocks.user }, employer: { findMany: mocks.employer },
  partner: { findMany: mocks.partner }, job: { findMany: mocks.job },
} }));
import { GET } from '@/app/api/admin/search/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue('org-a');
  for (const fn of [mocks.user, mocks.employer, mocks.partner, mocks.job]) fn.mockResolvedValue([]);
});
const request = (query = 'Mike Brown', limit = '8') => new NextRequest(`https://www.workforceap.org/api/admin/search?q=${encodeURIComponent(query)}&limit=${limit}`);

describe('admin search tenant and navigation boundaries', () => {
  it('returns 401 before reading directory records when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.isAdmin).not.toHaveBeenCalled();
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    for (const fn of [mocks.user, mocks.employer, mocks.partner, mocks.job]) expect(fn).not.toHaveBeenCalled();
  });
  it('returns 403 before reading directory records when the caller is not an admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    for (const fn of [mocks.user, mocks.employer, mocks.partner, mocks.job]) expect(fn).not.toHaveBeenCalled();
  });
  it('never reads directory records when organization resolution fails', async () => {
    mocks.getActorOrganizationId.mockRejectedValue(new Error('missing actor organization'));
    expect((await GET(request())).status).toBe(403);
    for (const fn of [mocks.user, mocks.employer, mocks.partner, mocks.job]) expect(fn).not.toHaveBeenCalled();
  });
  it('never treats an empty organization as cross-tenant permission', async () => {
    mocks.getActorOrganizationId.mockResolvedValue('');
    expect((await GET(request())).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it('scopes all entity types and matches every name/email token', async () => {
    const response = await GET(request('  Mike    Brown  '));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const userQuery = mocks.user.mock.calls[0][0];
    expect(userQuery.where.organizationId).toBe('org-a');
    expect(userQuery.where.deletedAt).toBeNull();
    expect(userQuery.where.AND).toHaveLength(2);
    expect(userQuery.where.AND[0].OR[0].fullName.contains).toBe('Mike');
    expect(userQuery.where.AND[1].OR[1].email.contains).toBe('Brown');
    for (const fn of [mocks.user, mocks.employer, mocks.partner, mocks.job]) {
      expect(fn).toHaveBeenCalledTimes(2);
      for (const [query] of fn.mock.calls) expect(query.where.organizationId).toBe('org-a');
      expect(fn.mock.calls[1][0].take).toBe(8);
    }
    expect(mocks.user.mock.calls[1][0].where.deletedAt).toBeNull();
    expect(mocks.partner.mock.calls[1][0].where.active).toBe(true);
    // A job must belong to this org itself; an employer relation alone cannot
    // authorize a cross-tenant job left by a migration or bad association.
    for (const [query] of mocks.job.mock.calls) {
      expect(query.where.employer.organizationId).toBe('org-a');
      expect(query.where.status).toBe('live');
    }
  });
  it('only an explicit super-admin may search across organizations', async () => {
    mocks.isSuperAdmin.mockResolvedValue(true);
    expect((await GET(request())).status).toBe(200);
    expect(mocks.getActorOrganizationId).not.toHaveBeenCalled();
    expect(mocks.user.mock.calls[0][0].where.organizationId).toBeUndefined();
    expect(mocks.job.mock.calls[0][0].where.organizationId).toBeUndefined();
  });
  it('returns individual employer destinations and identifies staff correctly', async () => {
    mocks.user.mockResolvedValue([{
      id: 'staff-1', fullName: 'Mike Brown', email: 'mike@example.test', enrolledProgram: null,
      profile: { role: 'member' }, userRoles: [{ role: { name: 'admin' } }],
    }]);
    mocks.employer.mockResolvedValue([
      { id: 'employer-1', companyName: 'Mike Brown Industries', industry: null },
      { id: 'employer-2', companyName: 'Mike Brown Services', industry: null },
    ]);
    const { results } = await (await GET(request())).json();
    expect(results[0]).toMatchObject({ type: 'staff', href: '/admin/users?ui=legacy&search=mike%40example.test' });
    expect(results.filter((row: { type: string }) => row.type === 'employer').map((row: { href: string }) => row.href))
      .toEqual(['/admin/employers/employer-1', '/admin/employers/employer-2']);
  });
  it('clamps negative limits before Prisma and response slicing', async () => {
    mocks.employer.mockResolvedValue([{ id: 'a', companyName: 'Mike A', industry: null }, { id: 'b', companyName: 'Mike B', industry: null }]);
    const response = await GET(request('Mike', '-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).results).toHaveLength(1);
    expect(mocks.user.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  it.each([
    { query: 'Sam', fullName: 'Sam', email: 'sam@example.test' },
    { query: 'sam@example.test', fullName: 'Zoe Samuels', email: 'sam@example.test' },
  ])('includes an exact user hit excluded from the general candidate pool: $query', async ({ query, fullName, email }) => {
    const general = Array.from({ length: 24 }, (_, index) => ({
      id: `contains-${index}`, fullName: `Aaron ${index} ${query} Candidate`,
      email: `aaron-${index}-${query}@example.test`, enrolledProgram: null,
      profile: { role: 'member' }, userRoles: [],
    }));
    const exact = { id: 'exact-user', fullName, email, enrolledProgram: null, profile: { role: 'member' }, userRoles: [] };
    mocks.user.mockResolvedValueOnce(general).mockResolvedValueOnce([exact]);
    const { results } = await (await GET(request(query))).json();
    expect(results).toHaveLength(8);
    expect(results[0]).toMatchObject({ id: exact.id, type: 'member', href: '/admin/members/exact-user' });
    expect(mocks.user.mock.calls[1][0].where.OR).toEqual([
      { fullName: { equals: query, mode: 'insensitive' } },
      { email: { equals: query, mode: 'insensitive' } },
    ]);
  });

  it.each(['employer', 'partner', 'job'] as const)('includes an exact %s label outside its general candidate pool', async type => {
    const makeRow = (id: string, label: string) => type === 'employer'
      ? { id, companyName: label, industry: null }
      : type === 'partner'
        ? { id, name: label, organizationType: null }
        : { id, title: label, employer: { companyName: 'Employer' } };
    const general = Array.from({ length: 24 }, (_, index) => makeRow(`contains-${index}`, `Aaron ${index} Sam`));
    mocks[type].mockResolvedValueOnce(general).mockResolvedValueOnce([makeRow('exact', 'Sam')]);
    const { results } = await (await GET(request('Sam'))).json();
    expect(results).toHaveLength(8);
    expect(results[0]).toMatchObject({ id: 'exact', type, label: 'Sam' });
  });
});
