import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return {
    NextResponse: MockNextResponse,
    after: vi.fn((callback: () => unknown) => {
      void Promise.resolve(callback()).catch(() => undefined);
    }),
  };
});

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    job: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(() => Promise.resolve('org-1')),
}));

vi.mock('@/lib/email', () => ({
  sendJobApprovedEmail: vi.fn(),
  sendJobRejectedEmail: vi.fn(),
}));

vi.mock('@/lib/employer/triggerEmployerJobAiMatch', () => ({
  runAiMatchForLiveJob: vi.fn(async () => undefined),
}));

vi.mock('@/lib/jobs/listingCache', () => ({
  invalidateJobListings: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({})),
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(async () => undefined),
}));

const { POST: approvePost } = await import('@/app/api/admin/jobs/[id]/approve/route');
const { POST: rejectPost } = await import('@/app/api/admin/jobs/[id]/reject/route');
const { getUser } = await import('@/lib/auth/server');
const { isAdmin } = await import('@/lib/auth/roles');
const { prisma } = await import('@/lib/db/prisma');
const { withTenantScope } = await import('@/lib/tenant/withTenantScope');
const { getActorOrganizationId } = await import('@/lib/tenant/organization');
const { sendJobApprovedEmail, sendJobRejectedEmail } = await import('@/lib/email');
const { runAiMatchForLiveJob } = await import('@/lib/employer/triggerEmployerJobAiMatch');
const { invalidateJobListings } = await import('@/lib/jobs/listingCache');
const { after } = await import('next/server');

const adminUser = { id: 'admin-1', email: 'admin@wap.org' };
const pendingJob = {
  id: 'job-1',
  status: 'pending',
  title: 'IT Support Specialist',
  employer: {
    contactEmail: 'jobs@acme.test',
    companyName: 'Acme',
    user: { email: 'owner@acme.test', fullName: 'Pat Owner' },
  },
};

function approveRequest() {
  return new Request('http://localhost:3000/api/admin/jobs/job-1/approve', { method: 'POST' });
}

function rejectRequest(body: unknown = { reason: 'Missing wage range' }) {
  return new Request('http://localhost:3000/api/admin/jobs/job-1/reject', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'job-1' }) };

async function signInAdmin() {
  vi.mocked(getUser).mockResolvedValue(adminUser as never);
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
}

describe('POST /api/admin/jobs/[id]/approve', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await signInAdmin();
    vi.mocked(prisma.job.findFirst).mockResolvedValue(pendingJob as never);
    vi.mocked(prisma.job.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(sendJobApprovedEmail).mockResolvedValue({ ok: true } as never);
    vi.mocked(invalidateJobListings).mockResolvedValue(undefined);
    vi.mocked(runAiMatchForLiveJob).mockResolvedValue(undefined);
    vi.mocked(after).mockImplementation(((callback: () => unknown) => {
      void Promise.resolve(callback()).catch(() => undefined);
    }) as typeof after);
  });

  it('returns 401 before looking up a job when the actor is unsigned', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(401);
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 before looking up a job when the actor is not an admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(403);
    expect(prisma.job.findFirst).not.toHaveBeenCalled();
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it('scopes the lookup and optimistic update to the actor organization', async () => {
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(200);
    expect(withTenantScope).toHaveBeenCalledTimes(2);
    expect(withTenantScope).toHaveBeenNthCalledWith(1, 'org-1', expect.any(Function));
    expect(withTenantScope).toHaveBeenNthCalledWith(2, 'org-1', expect.any(Function));
    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: 'pending' },
      data: expect.objectContaining({
        status: 'live',
        approvedById: 'admin-1',
      }),
    });
  });

  it('returns 404 when the tenant-scoped job is missing', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
    expect(sendJobApprovedEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when the job is no longer pending', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ ...pendingJob, status: 'live' } as never);
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Job is not pending approval' });
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the optimistic pending update matches no row', async () => {
    vi.mocked(prisma.job.updateMany).mockResolvedValue({ count: 0 } as never);
    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Job is no longer pending approval' });
    expect(sendJobApprovedEmail).not.toHaveBeenCalled();
    expect(runAiMatchForLiveJob).not.toHaveBeenCalled();
    expect(invalidateJobListings).not.toHaveBeenCalled();
  });

  it('keeps the committed approval when the employer email throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(sendJobApprovedEmail).mockRejectedValueOnce(new Error('resend down'));

    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      notificationEmailSent: false,
      cacheInvalidated: true,
      warning: expect.stringContaining('Employer notification email was not sent.'),
    });
    expect(prisma.job.updateMany).toHaveBeenCalledTimes(1);
    expect(runAiMatchForLiveJob).toHaveBeenCalledWith('job-1', 'org-1');
    consoleError.mockRestore();
  });

  it('keeps the committed approval when cache invalidation throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(invalidateJobListings).mockRejectedValueOnce(new Error('cache down'));

    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      notificationEmailSent: true,
      cacheInvalidated: false,
      warning: expect.stringContaining('Job cache refresh could not be confirmed.'),
    });
    consoleError.mockRestore();
  });

  it('retains AI matching with after() so the approval response does not wait on it', async () => {
    const retained: Array<() => unknown> = [];
    vi.mocked(after).mockImplementation(((task: () => unknown) => {
      retained.push(task);
    }) as typeof after);

    const res = await approvePost(approveRequest() as never, params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      notificationEmailSent: true,
      cacheInvalidated: true,
    });
    expect(retained).toHaveLength(1);
    expect(runAiMatchForLiveJob).not.toHaveBeenCalled();

    await retained[0]();
    expect(runAiMatchForLiveJob).toHaveBeenCalledTimes(1);
    expect(runAiMatchForLiveJob).toHaveBeenCalledWith('job-1', 'org-1');
  });
});

describe('POST /api/admin/jobs/[id]/reject', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await signInAdmin();
    vi.mocked(prisma.job.findFirst).mockResolvedValue(pendingJob as never);
    vi.mocked(prisma.job.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(sendJobRejectedEmail).mockResolvedValue({ ok: true } as never);
    vi.mocked(invalidateJobListings).mockResolvedValue(undefined);
  });

  it('returns 400 without writing when the reason is missing or too long', async () => {
    const missing = await rejectPost(rejectRequest({}) as never, params);
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'Reason is required' });

    const tooLong = await rejectPost(rejectRequest({ reason: 'x'.repeat(1001) }) as never, params);
    expect(tooLong.status).toBe(400);

    const invalidJson = await rejectPost(
      new Request('http://localhost:3000/api/admin/jobs/job-1/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
      params,
    );
    expect(invalidJson.status).toBe(400);
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
    expect(sendJobRejectedEmail).not.toHaveBeenCalled();
  });

  it('returns 409 when the optimistic pending update matches no row', async () => {
    vi.mocked(prisma.job.updateMany).mockResolvedValue({ count: 0 } as never);
    const res = await rejectPost(rejectRequest() as never, params);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Job is no longer pending' });
    expect(sendJobRejectedEmail).not.toHaveBeenCalled();
    expect(invalidateJobListings).not.toHaveBeenCalled();
  });

  it('keeps the committed rejection when the employer email throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(sendJobRejectedEmail).mockRejectedValueOnce(new Error('resend down'));

    const res = await rejectPost(rejectRequest() as never, params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      notificationEmailSent: false,
      cacheInvalidated: true,
      warning: expect.stringContaining('Job rejected.'),
    });
    expect(sendJobRejectedEmail).toHaveBeenCalledWith({
      to: 'jobs@acme.test',
      jobTitle: 'IT Support Specialist',
      companyName: 'Acme',
      reason: 'Missing wage range',
      orgId: 'org-1',
    });
    expect(prisma.job.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', status: 'pending' },
      data: { status: 'closed' },
    });
    consoleError.mockRestore();
  });
});
