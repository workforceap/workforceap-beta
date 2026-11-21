import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/admin/employers/[id]/deactivate and /reactivate change whether
 * an employer's live jobs appear to members. Auth and withTenantScope must
 * hold before the status write: guessing another tenant's UUID must 404
 * without flipping their hiring pipeline.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  withTenantScope: vi.fn(),
  invalidateJobListings: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({
  requireAdmin: mocks.requireAdmin,
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getActorOrganizationId }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/jobs/listingCache', () => ({ invalidateJobListings: mocks.invalidateJobListings }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: mocks.logAuditEvent,
  auditRequestMeta: () => ({}),
}));

import { POST as deactivate } from '@/app/api/admin/employers/[id]/deactivate/route';
import { POST as reactivate } from '@/app/api/admin/employers/[id]/reactivate/route';

const ORG = 'org-a';
const EMPLOYER = 'employer-1';
const params = { params: Promise.resolve({ id: EMPLOYER }) };

function req() {
  return new Request(`http://localhost/api/admin/employers/${EMPLOYER}/deactivate`, { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActorOrganizationId.mockResolvedValue(ORG);
  mocks.withTenantScope.mockImplementation(async (_orgId: string, fn: (db: unknown) => unknown) =>
    fn({ employer: { findFirst: mocks.findFirst, update: mocks.update } }),
  );
  mocks.findFirst.mockResolvedValue({ id: EMPLOYER, status: 'active' });
  mocks.update.mockResolvedValue({ id: EMPLOYER, status: 'inactive' });
  mocks.invalidateJobListings.mockResolvedValue(undefined);
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

describe('POST /api/admin/employers/[id]/deactivate', () => {
  it('returns 401 before lookup when unsigned', async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await deactivate(req(), params);
    expect(res.status).toBe(401);
    expect(mocks.withTenantScope).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not admin', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
    const res = await deactivate(req(), params);
    expect(res.status).toBe(403);
    expect(mocks.withTenantScope).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant-scoped employer is missing, without writing', async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await deactivate(req(), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Employer not found' });
    expect(mocks.withTenantScope).toHaveBeenCalledWith(ORG, expect.any(Function));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.invalidateJobListings).not.toHaveBeenCalled();
  });

  it('returns 400 when the employer is already inactive, without writing', async () => {
    mocks.findFirst.mockResolvedValue({ id: EMPLOYER, status: 'inactive' });
    const res = await deactivate(req(), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Employer is already inactive' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('deactivates only through the actor org scope and drops the job cache', async () => {
    const res = await deactivate(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'inactive' });
    expect(mocks.withTenantScope).toHaveBeenNthCalledWith(1, ORG, expect.any(Function));
    expect(mocks.withTenantScope).toHaveBeenNthCalledWith(2, ORG, expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: EMPLOYER },
      data: { status: 'inactive' },
    });
    expect(mocks.invalidateJobListings).toHaveBeenCalledTimes(1);
  });

  it('answers 500 when the lookup throws', async () => {
    mocks.findFirst.mockRejectedValue(new Error('db down'));
    const res = await deactivate(req(), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/employers/[id]/reactivate', () => {
  beforeEach(() => {
    mocks.findFirst.mockResolvedValue({ id: EMPLOYER, status: 'inactive' });
    mocks.update.mockResolvedValue({ id: EMPLOYER, status: 'active' });
  });

  it('returns 404 when the tenant-scoped employer is missing, without writing', async () => {
    mocks.findFirst.mockResolvedValue(null);
    const res = await reactivate(req(), params);
    expect(res.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 400 when the employer is already active, without writing', async () => {
    mocks.findFirst.mockResolvedValue({ id: EMPLOYER, status: 'active' });
    const res = await reactivate(req(), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Employer is already active' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reactivates only through the actor org scope', async () => {
    const res = await reactivate(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: 'active' });
    expect(mocks.withTenantScope).toHaveBeenCalledWith(ORG, expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: EMPLOYER },
      data: { status: 'active' },
    });
    expect(mocks.invalidateJobListings).toHaveBeenCalledTimes(1);
  });
});
