import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
    after: (fn: () => unknown) => fn(),
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  getEmployerForUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const job = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const employer = {
    findUnique: vi.fn(),
  };
  const jobPostingApplication = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const mockPrisma: any = {
    job,
    employer,
    jobPostingApplication,
    $transaction: vi.fn(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    }),
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/email', () => ({
  sendJobSubmittedEmail: vi.fn(),
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/employer/jobCreate', () => ({
  buildEmployerJobCreateData: vi.fn((_orgId, _employerId, data) => data),
  getRouteErrorDetails: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : 'Unknown error',
    code: undefined,
  })),
}));

vi.mock('@/lib/portal/workflowEvents', () => ({
  recordEmployerWorkflowEvent: vi.fn(),
}));

vi.mock('@/lib/employer/applicationStatusEffects', () => ({
  notifyAndRecordPlacement: vi.fn(() => Promise.resolve()),
}));

// ─── Imports after mocks ───
import { GET as listJobs, POST as createJob } from '@/app/api/employer/jobs/route';
import { GET as getJob, PATCH as updateJob, DELETE as deleteJob } from '@/app/api/employer/jobs/[id]/route';
import { GET as listApplicants, PATCH as updateApplicant } from '@/app/api/employer/jobs/[id]/applicants/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { sendJobSubmittedEmail } from '@/lib/email';
import { trackEvent } from '@/lib/events/track';
import { buildEmployerJobCreateData } from '@/lib/employer/jobCreate';
import { NextRequest } from 'next/server';

const UUIDS = {
  user: '550e8400-e29b-41d4-a716-446655440001',
  employer: '550e8400-e29b-41d4-a716-446655440002',
  org: '550e8400-e29b-41d4-a716-446655440003',
  job1: '550e8400-e29b-41d4-a716-446655440004',
  job2: '550e8400-e29b-41d4-a716-446655440005',
};

const approvedEmployerCtx = {
  employerId: UUIDS.employer,
  employer: { status: 'approved' },
};

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: UUIDS.job1,
    title: 'Software Engineer',
    description: 'Build software',
    location: 'Austin, TX',
    locationType: 'hybrid',
    jobType: 'fulltime',
    status: 'live',
    employerId: UUIDS.employer,
    organizationId: UUIDS.org,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    applications: [],
    ...overrides,
  };
}

function makeRequest(url: string, opts?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, opts);
}

// ─────────────────────────────────────────────
// POST /api/employer/jobs
// ─────────────────────────────────────────────
describe('POST /api/employer/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Job', description: 'Desc' }),
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not an employer', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Job', description: 'Desc' }),
      })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: employer access required' });
  });

  it('returns 400 when required fields are missing', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);

    const res = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('validates required fields (title, description, location)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);

    // Missing description
    const missingDesc = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Title', location: 'Austin' }),
      })
    );
    expect(missingDesc.status).toBe(400);

    // Missing title
    const missingTitle = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'Desc', location: 'Austin' }),
      })
    );
    expect(missingTitle.status).toBe(400);
  });

  it('creates a job posting for authenticated employer', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(approvedEmployerCtx as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      id: UUIDS.employer,
      companyName: 'Acme Inc',
      contactEmail: 'acme@example.com',
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.job.create).mockResolvedValue(makeJob() as any);

    const payload = {
      title: 'Software Engineer',
      description: 'Build great software',
      location: 'Austin, TX',
      status: 'draft',
    };

    const res = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Software Engineer');

    expect(prisma.job.create).toHaveBeenCalled();
    expect(buildEmployerJobCreateData).toHaveBeenCalledWith(
      UUIDS.org,
      UUIDS.employer,
      expect.objectContaining(payload)
    );
  });

  it('sends email and tracks event when status is pending', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(approvedEmployerCtx as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      id: UUIDS.employer,
      companyName: 'Acme Inc',
      contactEmail: 'acme@example.com',
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.job.create).mockResolvedValue(makeJob({ status: 'pending' }) as any);

    const res = await createJob(
      makeRequest('http://localhost:3000/api/employer/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Software Engineer',
          description: 'Build software',
          status: 'pending',
        }),
      })
    );

    expect(res.status).toBe(201);
    expect(sendJobSubmittedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        jobTitle: 'Software Engineer',
        companyName: 'Acme Inc',
        employerEmail: 'acme@example.com',
      })
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'employer_job_submitted_for_review' })
    );
  });
});

// ─────────────────────────────────────────────
// GET /api/employer/jobs
// ─────────────────────────────────────────────
describe('GET /api/employer/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await listJobs(makeRequest('http://localhost:3000/api/employer/jobs'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await listJobs(makeRequest('http://localhost:3000/api/employer/jobs'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: employer access required' });
  });

  it("returns employer's job postings with application count", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      id: UUIDS.employer,
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([
      makeJob({ id: UUIDS.job1, applications: [{ id: 'app-1' }, { id: 'app-2' }] }),
      makeJob({ id: UUIDS.job2, applications: [{ id: 'app-3' }] }),
    ] as any);

    const res = await listJobs(makeRequest('http://localhost:3000/api/employer/jobs'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].applicationsCount).toBe(2);
    expect(body[1].applicationsCount).toBe(1);
    expect(body[0].applications).toBeUndefined();
  });

  it('filters by status query parameter', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      id: UUIDS.employer,
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([makeJob({ status: 'live' })] as any);

    const res = await listJobs(
      makeRequest('http://localhost:3000/api/employer/jobs?filter=live')
    );
    expect(res.status).toBe(200);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employerId: UUIDS.employer,
          status: { in: ['live'] },
        }),
      })
    );
  });

  it('filters by locationType query parameter', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      id: UUIDS.employer,
      organizationId: UUIDS.org,
    } as any);
    vi.mocked(prisma.job.findMany).mockResolvedValue([makeJob({ locationType: 'remote' })] as any);

    const res = await listJobs(
      makeRequest('http://localhost:3000/api/employer/jobs?locationType=remote')
    );
    expect(res.status).toBe(200);

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employerId: UUIDS.employer,
          locationType: 'remote',
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// GET /api/employer/jobs/[id]
// ─────────────────────────────────────────────
describe('GET /api/employer/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id: string) => Promise.resolve({ id });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await getJob(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await getJob(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns job details for owned job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(
      makeJob({
        applications: [
          { id: 'app-1', student: { id: 's1', fullName: 'Alice', email: 'alice@example.com' } },
        ],
      }) as any
    );

    const res = await getJob(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(UUIDS.job1);
    expect(body.applications).toHaveLength(1);
  });

  it('returns 404 for missing job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await getJob(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });
});

// ─────────────────────────────────────────────
// PATCH /api/employer/jobs/[id]
// ─────────────────────────────────────────────
describe('PATCH /api/employer/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id: string) => Promise.resolve({ id });

  function makePatchRequest(id: string, body: Record<string, unknown>) {
    return makeRequest(`http://localhost:3000/api/employer/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { title: 'Updated' }), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { title: 'Updated' }), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('updates job posting for authenticated employer', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(approvedEmployerCtx as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(makeJob() as any);
    vi.mocked(prisma.job.update).mockResolvedValue(makeJob({ title: 'Updated Title' }) as any);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { title: 'Updated Title' }), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Updated Title');
  });

  it('returns 404 for missing job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { title: 'Updated' }), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });

  it('returns 403/404 for other employers job (findFirst returns null)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await updateJob(makePatchRequest(UUIDS.job2, { title: 'Updated' }), {
      params: makeParams(UUIDS.job2),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });

  it('sends email when transitioning draft to pending', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(approvedEmployerCtx as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(makeJob({ status: 'draft' }) as any);
    vi.mocked(prisma.job.update).mockResolvedValue(makeJob({ status: 'pending' }) as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({
      companyName: 'Acme Inc',
      contactEmail: 'acme@example.com',
    } as any);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { status: 'pending' }), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(200);
    expect(sendJobSubmittedEmail).toHaveBeenCalled();
  });

  it.each(['approved', 'live'])('rejects employer transition to %s', async (status) => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({
      employerId: UUIDS.employer,
      employer: { status: 'approved' },
    } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(makeJob({ status: 'draft' }) as any);

    const res = await updateJob(makePatchRequest(UUIDS.job1, { status }), {
      params: makeParams(UUIDS.job1),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Job approval and publishing require admin review.' });
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// DELETE /api/employer/jobs/[id]
// ─────────────────────────────────────────────
describe('DELETE /api/employer/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id: string) => Promise.resolve({ id });

  function makeDeleteRequest(id: string) {
    return makeRequest(`http://localhost:3000/api/employer/jobs/${id}`, {
      method: 'DELETE',
    });
  }

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await deleteJob(makeDeleteRequest(UUIDS.job1), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await deleteJob(makeDeleteRequest(UUIDS.job1), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 404 for missing job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await deleteJob(makeDeleteRequest(UUIDS.job1), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });

  it('soft-deletes (closes) job for authenticated employer', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(makeJob() as any);
    vi.mocked(prisma.job.update).mockResolvedValue(makeJob({ status: 'closed' }) as any);

    const res = await deleteJob(makeDeleteRequest(UUIDS.job1), {
      params: makeParams(UUIDS.job1),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job.status).toBe('closed');
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: UUIDS.job1 },
        data: { status: 'closed' },
      })
    );
  });
});

// ─────────────────────────────────────────────
// GET /api/employer/jobs/[id]/applicants
// ─────────────────────────────────────────────
describe('GET /api/employer/jobs/[id]/applicants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id: string) => Promise.resolve({ id });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await listApplicants(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}/applicants`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await listApplicants(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}/applicants`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 404 for missing job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await listApplicants(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}/applicants`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });

  it('returns applicants for owned job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: UUIDS.job1, title: 'Software Engineer' } as any);
    vi.mocked(prisma.jobPostingApplication.findMany).mockResolvedValue([
      {
        id: 'app-1',
        status: 'pending',
        appliedAt: new Date('2025-01-15'),
        employerNotes: null,
        student: { id: 's1', fullName: 'Alice', email: 'alice@example.com' },
      },
    ] as any);

    const res = await listApplicants(
      makeRequest(`http://localhost:3000/api/employer/jobs/${UUIDS.job1}/applicants`),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(UUIDS.job1);
    expect(body.applicants).toHaveLength(1);
    expect(body.applicants[0].student.fullName).toBe('Alice');
  });
});

// ─────────────────────────────────────────────
// PATCH /api/employer/jobs/[id]/applicants
// ─────────────────────────────────────────────
describe('PATCH /api/employer/jobs/[id]/applicants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id: string) => Promise.resolve({ id });

  function makeApplicantPatchRequest(id: string, applicantId: string, body: Record<string, unknown>) {
    return makeRequest(
      `http://localhost:3000/api/employer/jobs/${id}/applicants?applicantId=${applicantId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  }

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await updateApplicant(
      makeApplicantPatchRequest(UUIDS.job1, 'app-1', { status: 'reviewing' }),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user has no employer context', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null);

    const res = await updateApplicant(
      makeApplicantPatchRequest(UUIDS.job1, 'app-1', { status: 'reviewing' }),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 404 for missing job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null);

    const res = await updateApplicant(
      makeApplicantPatchRequest(UUIDS.job1, 'app-1', { status: 'reviewing' }),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Job not found' });
  });

  it('returns 400 for invalid status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: UUIDS.job1 } as any);

    const res = await updateApplicant(
      makeApplicantPatchRequest(UUIDS.job1, 'app-1', { status: 'invalid' }),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(400);
  });

  it('updates applicant status for owned job', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: UUIDS.employer } as any);
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: UUIDS.job1 } as any);
    vi.mocked(prisma.jobPostingApplication.findFirst)
      .mockResolvedValueOnce({ id: 'app-1', status: 'pending' } as any)
      .mockResolvedValueOnce({ id: 'app-1', status: 'reviewing' } as any);
    vi.mocked(prisma.jobPostingApplication.updateMany).mockResolvedValue({ count: 1 } as any);

    const res = await updateApplicant(
      makeApplicantPatchRequest(UUIDS.job1, 'app-1', { status: 'reviewing' }),
      { params: makeParams(UUIDS.job1) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.application.status).toBe('reviewing');
    expect(prisma.jobPostingApplication.update).not.toHaveBeenCalled();
    expect(prisma.jobPostingApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1', jobId: UUIDS.job1, status: 'pending' },
        data: expect.objectContaining({ status: 'reviewing' }),
      })
    );
  });
});
