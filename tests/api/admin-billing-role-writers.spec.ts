// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  counselorFindUnique: vi.fn(),
  counselorCreate: vi.fn(),
  profileUpsert: vi.fn(),
  employerFindUnique: vi.fn(),
  employerCreate: vi.fn(),
  roleFindUnique: vi.fn(),
  userRoleUpsert: vi.fn(),
  lock: vi.fn(),
  unresolved: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => true),
  isAdminInOrg: vi.fn(async () => true),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({ resolveOrgFromRequest: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => fn({
    user: { findUnique: mocks.userFindUnique },
    counselor: { findUnique: mocks.counselorFindUnique },
    partner: { findUnique: vi.fn() },
  })),
  crossTenantOK: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  counselorInOrg: vi.fn(),
  assertSameTenant: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
    counselor: { findUnique: mocks.counselorFindUnique, create: mocks.counselorCreate },
    profile: { upsert: mocks.profileUpsert },
    employer: { findUnique: mocks.employerFindUnique, create: mocks.employerCreate },
    role: { findUnique: mocks.roleFindUnique },
    userRole: { upsert: mocks.userRoleUpsert },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) } };
});
vi.mock('@/lib/billing/erasureGuard', () => ({
  lockBillingMemberLifecycle: mocks.lock,
  scopedBillingUser: vi.fn(async (tx: unknown) => tx),
  hasUnresolvedBillingSend: mocks.unresolved,
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

import { POST as createCounselor } from '@/app/api/admin/counselors/route';
import { POST as createEmployer } from '@/app/api/admin/employers/route';

const userId = '550e8400-e29b-41d4-a716-446655440001';
const post = (path: string, body: object) => new Request(`http://localhost${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

describe('existing-user role writes respect billing deletion ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: userId });
    mocks.userFindFirst.mockResolvedValue({ id: userId });
    mocks.counselorFindUnique.mockResolvedValue(null);
    mocks.employerFindUnique.mockResolvedValue(null);
    mocks.employerCreate.mockResolvedValue({ id: 'employer-1' });
    mocks.roleFindUnique.mockResolvedValue({ id: 'employer-role' });
    mocks.unresolved.mockResolvedValue(false);
  });

  it('blocks counselor promotion when erasure owns the account', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    const response = await createCounselor(post('/api/admin/counselors', { userId }) as never);
    expect(response.status).toBe(409);
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), userId);
    expect(mocks.counselorCreate).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
  });

  it('holds the lifecycle lock through counselor promotion', async () => {
    const response = await createCounselor(post('/api/admin/counselors', { userId }) as never);
    expect(response.status).toBe(200);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.counselorCreate.mock.invocationCallOrder[0]);
    expect(mocks.profileUpsert).toHaveBeenCalledOnce();
  });

  it('blocks employer and role creation when erasure owns the account', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    const response = await createEmployer(post('/api/admin/employers', {
      userId, companyName: 'Acme', contactName: 'Pat', contactEmail: 'pat@example.test',
    }) as never);
    expect(response.status).toBe(409);
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), userId);
    expect(mocks.employerCreate).not.toHaveBeenCalled();
    expect(mocks.userRoleUpsert).not.toHaveBeenCalled();
  });

  it('creates the employer and role inside the held lifecycle transaction', async () => {
    const response = await createEmployer(post('/api/admin/employers', {
      userId, companyName: 'Acme', contactName: 'Pat', contactEmail: 'pat@example.test',
    }) as never);
    expect(response.status).toBe(201);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.employerCreate.mock.invocationCallOrder[0]);
    expect(mocks.userRoleUpsert).toHaveBeenCalledOnce();
  });

  it('keeps ordinary role writes available on migrated Preview without advisory locks', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    try {
      const counselorResponse = await createCounselor(post('/api/admin/counselors', { userId }) as never);
      const employerResponse = await createEmployer(post('/api/admin/employers', {
        userId, companyName: 'Acme', contactName: 'Pat', contactEmail: 'pat@example.test',
      }) as never);
      expect(counselorResponse.status).toBe(200);
      expect(employerResponse.status).toBe(201);
      expect(mocks.lock).not.toHaveBeenCalled();
      expect(mocks.userFindFirst).toHaveBeenCalledTimes(2);
      expect(mocks.unresolved).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
