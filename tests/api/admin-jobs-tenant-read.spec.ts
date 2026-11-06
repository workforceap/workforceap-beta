// @vitest-environment node
/**
 * GET /api/admin/jobs and GET /api/admin/jobs/[id] are tenant-scoped listing
 * and detail reads. An unsigned or non-admin caller must not look up jobs,
 * and a missing or other-tenant id must 404 before application PII is
 * returned. The list also maps filter query values and fills a missing
 * employer so the admin jobs table cannot crash on a detached row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  scopedOrg: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (orgId: string, fn: (db: unknown) => unknown) => {
    h.scopedOrg(orgId);
    return fn({ job: { findFirst: h.findFirst, findMany: h.findMany } });
  }),
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET: getJob } = await import('@/app/api/admin/jobs/[id]/route');
const { GET: listJobs } = await import('@/app/api/admin/jobs/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const JOB_ID = '550e8400-e29b-41d4-a716-446655440003';

function detailRequest() {
  return new Request(`http://localhost:3000/api/admin/jobs/${JOB_ID}`);
}

function listRequest(filter?: string) {
  const url = new URL('http://localhost:3000/api/admin/jobs');
  if (filter !== undefined) url.searchParams.set('filter', filter);
  return new Request(url);
}

function detailParams(id = JOB_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/admin/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findFirst.mockResolvedValue({
      id: JOB_ID,
      title: 'Help desk',
      employer: { id: 'emp-1', companyName: 'Acme', contactEmail: 'hiring@acme.test', contactName: 'Pat' },
      applications: [],
    });
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getJob(detailRequest() as never, detailParams());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await getJob(detailRequest() as never, detailParams());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant-scoped job is missing', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await getJob(detailRequest() as never, detailParams());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: JOB_ID } }),
    );
  });

  it('returns the tenant job when the scoped lookup finds it', async () => {
    const res = await getJob(detailRequest() as never, detailParams());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: JOB_ID, title: 'Help desk' });
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
  });

  it('returns 500 when the lookup throws', async () => {
    h.findFirst.mockRejectedValue(new Error('db down'));
    const res = await getJob(detailRequest() as never, detailParams());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/admin/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findMany.mockResolvedValue([]);
  });

  it('returns 401 before listing when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await listJobs(listRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.scopedOrg).not.toHaveBeenCalled();
  });

  it('returns 403 before listing when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await listJobs(listRequest() as never);
    expect(res.status).toBe(403);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, {}],
    ['all', {}],
    ['unknown', {}],
    ['pending', { status: { in: ['pending'] } }],
    ['live', { status: { in: ['live'] } }],
    ['filled', { status: { in: ['filled', 'closed'] } }],
    ['draft', { status: { in: ['draft'] } }],
    ['approved', { status: { in: ['approved'] } }],
  ] as const)('maps filter=%s to the tenant-scoped where', async (filter, where) => {
    const res = await listJobs(listRequest(filter) as never);
    expect(res.status).toBe(200);
    expect(h.scopedOrg).toHaveBeenCalledWith(ORG_ID);
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        take: 1000,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  });

  it('fills a missing employer and applicationsCount so the table can render', async () => {
    h.findMany.mockResolvedValue([
      {
        id: JOB_ID,
        title: 'Help desk',
        employer: null,
        _count: { applications: 4 },
      },
      {
        id: 'job-2',
        title: 'Support',
        employer: { id: 'emp-1', companyName: 'Acme', contactEmail: 'hiring@acme.test' },
      },
    ]);
    const res = await listJobs(listRequest() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: JOB_ID,
        title: 'Help desk',
        employer: { id: '', companyName: 'Unknown', contactEmail: '' },
        _count: { applications: 4 },
        applicationsCount: 4,
      },
      {
        id: 'job-2',
        title: 'Support',
        employer: { id: 'emp-1', companyName: 'Acme', contactEmail: 'hiring@acme.test' },
        applicationsCount: 0,
      },
    ]);
  });

  it('returns 500 and records the throw when listing fails', async () => {
    const failure = new Error('db down');
    h.findMany.mockRejectedValue(failure);
    const res = await listJobs(listRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.captureApiError).toHaveBeenCalledWith(failure, { route: 'admin/jobs GET' });
  });
});
