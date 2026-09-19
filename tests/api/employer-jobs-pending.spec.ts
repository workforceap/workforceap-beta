import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  getEmployerForUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    employer: {
      findUnique: vi.fn(),
    },
    job: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendJobSubmittedEmail: vi.fn(),
}));

vi.mock('@/lib/employer/jobCreate', () => ({
  buildEmployerJobCreateData: vi.fn((orgId: string, employerId: string, data: any) => ({
    ...data,
    organizationId: orgId,
    employerId,
  })),
  getRouteErrorDetails: vi.fn((err: any) => ({ message: err?.message ?? 'Unknown', code: 'UNKNOWN' })),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: Function) => fn(prisma)),
}));

vi.mock('@/app/api/(portal)/dashboard/jobs/route', () => ({
  invalidateJobListings: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: vi.fn((handler: Function) => handler),
}));

// ─── Imports after mocks ───
import { POST as jobsPost, GET as jobsGet } from '@/app/api/employer/jobs/route';
import { PATCH as jobPatch } from '@/app/api/employer/jobs/[id]/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const employerUser = { id: 'user-1', email: 'employer@acme.com' };
const activeEmployer = { employerId: 'emp-1', employer: { id: 'emp-1', status: 'active' } };
const pendingEmployer = { employerId: 'emp-1', employer: { id: 'emp-1', status: 'pending_approval' } };

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/employer/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Employer jobs API — pending approval restrictions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(employerUser as any);
  });

  it('allows pending employer to create a draft job', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(pendingEmployer as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ companyName: 'Acme', contactEmail: 'acme@example.com', organizationId: 'org-1' } as any);
    vi.mocked(prisma.job.create).mockResolvedValue({ id: 'job-1', title: 'Dev', status: 'draft' } as any);

    const res = await jobsPost(makeRequest({ title: 'Dev', description: 'Build stuff', status: 'draft' }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('draft');
  });

  it('blocks pending employer from submitting a job for review', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(pendingEmployer as any);

    const res = await jobsPost(makeRequest({ title: 'Dev', description: 'Build stuff', status: 'pending' }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('pending approval');
  });

  it('blocks pending employer from posting a live job', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(pendingEmployer as any);

    const res = await jobsPost(makeRequest({ title: 'Dev', description: 'Build stuff', status: 'live' }) as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('pending approval');
  });

  it('allows active employer to submit a job for review', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(activeEmployer as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ companyName: 'Acme', contactEmail: 'acme@example.com', organizationId: 'org-1' } as any);
    vi.mocked(prisma.job.create).mockResolvedValue({ id: 'job-1', title: 'Dev', status: 'pending' } as any);

    const res = await jobsPost(makeRequest({ title: 'Dev', description: 'Build stuff', status: 'pending' }) as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('pending');
  });
});

describe('Employer job PATCH — pending approval restrictions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue(employerUser as any);
  });

  it('allows pending employer to update a job as draft', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(pendingEmployer as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: 'job-1', employerId: 'emp-1', status: 'draft' } as any);
    vi.mocked(prisma.job.update).mockResolvedValue({ id: 'job-1', status: 'draft' } as any);

    const res = await jobPatch(
      new Request('http://localhost:3000/api/employer/jobs/job-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Dev' }),
      }) as any,
      { params: Promise.resolve({ id: 'job-1' }) }
    );
    expect(res.status).toBe(200);
  });

  it('blocks pending employer from changing job status to pending', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(pendingEmployer as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: 'job-1', employerId: 'emp-1', status: 'draft' } as any);

    const res = await jobPatch(
      new Request('http://localhost:3000/api/employer/jobs/job-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      }) as any,
      { params: Promise.resolve({ id: 'job-1' }) }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('pending approval');
  });
});
