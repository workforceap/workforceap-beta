import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    job: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aIJobMatch: {
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/email', () => ({
  sendMatchActionEmail: vi.fn(),
}));

vi.mock('@/lib/diagnostics', () => ({
  recordWorkflowDiagnostic: vi.fn(),
}));

vi.mock('@/lib/admin/matchSuggestionsConfig', () => ({
  getMatchSuggestionsTestRecipient: vi.fn(() => undefined),
  isMatchSuggestionsDryRun: vi.fn(() => false),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: any) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

const { POST } = await import('@/app/api/admin/jobs/[id]/suggest-matches/route');
const { getUser } = await import('@/lib/auth/server');
const { isAdmin } = await import('@/lib/auth/roles');
const { prisma } = await import('@/lib/db/prisma');
const { sendMatchActionEmail } = await import('@/lib/email');
const { getActorOrganizationId } = await import('@/lib/tenant/organization');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const JOB_ID = '550e8400-e29b-41d4-a716-446655440003';

function makeRequest() {
  return new Request(`http://localhost:3000/api/admin/jobs/${JOB_ID}/suggest-matches`, {
    method: 'POST',
  });
}

function makeJob() {
  return {
    id: JOB_ID,
    title: 'Junior Developer',
    status: 'live',
    employer: {
      contactEmail: 'hiring@example.com',
      companyName: 'Acme',
    },
    aiMatches: [
      {
        id: 'match-1',
        jobId: JOB_ID,
        studentId: 'student-1',
        matchScore: 92,
        student: {
          id: 'student-1',
          fullName: 'Jane Candidate',
          enrolledProgram: 'Web Development',
        },
      },
    ],
  };
}

describe('POST /api/admin/jobs/[id]/suggest-matches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(prisma.job.findUnique).mockResolvedValue(makeJob() as any);
    vi.mocked(prisma.job.update).mockResolvedValue({} as any);
    vi.mocked(prisma.aIJobMatch.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(sendMatchActionEmail).mockResolvedValue({ ok: true } as any);
  });

  it('emails only rows claimed by this request when another request races it', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: 'match-1' }] as any)
      .mockResolvedValueOnce([] as any);

    const first = await POST(makeRequest(), { params: Promise.resolve({ id: JOB_ID }) });
    const second = await POST(makeRequest(), { params: Promise.resolve({ id: JOB_ID }) });

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(sendMatchActionEmail).toHaveBeenCalledTimes(1);
    expect(sendMatchActionEmail).toHaveBeenCalledWith({
      to: 'hiring@example.com',
      jobTitle: 'Junior Developer',
      companyName: 'Acme',
      subjectMemberIds: ['student-1'],
      matches: [{ name: 'Jane Candidate', program: 'Web Development', score: 92 }],
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
