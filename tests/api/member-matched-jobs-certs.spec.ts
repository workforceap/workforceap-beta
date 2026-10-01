import { beforeEach, describe, expect, it, vi } from 'vitest';

// V08: the member-side "matched jobs" score must read the same certifications
// as the employer-side matcher (lib/ai/matchStudents.ts) — staff-rejected
// certifications (CertStatus 'rejected', WAP-20) never count.

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const job = { findMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  const prisma = {
    job,
    user,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
    ),
  };
  return { prisma };
});

vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: vi.fn(() => undefined) }));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

const { GET } = await import('@/app/api/member/matched-jobs/route');
const { prisma } = await import('@/lib/db/prisma');
const { getUser } = await import('@/lib/auth/server');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

function member(certs: Array<{ certName: string; status: 'pending' | 'approved' }>) {
  return {
    enrolledProgram: null,
    assessmentScorePct: null,
    memberProgramProgress: [],
    courseProgress: [],
    userCertifications: certs,
  };
}

function job(id: string) {
  return {
    id,
    title: 'Help Desk Technician',
    location: 'Austin, TX',
    locationType: 'onsite',
    status: 'live',
    suggestedPrograms: [],
    requirements: [],
    preferredCertifications: ['CompTIA A+'],
    employer: { companyName: 'TechCorp' },
  };
}

describe('GET /api/member/matched-jobs certification status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 and reads nothing when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as never);
    const res = await (GET as unknown as (req: Request) => Promise<Response>)(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.job.findMany).not.toHaveBeenCalled();
  });

  it('queries only non-rejected certifications for the signed-in member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(member([]) as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as never);

    const res = await (GET as unknown as (req: Request) => Promise<Response>)(new Request('http://localhost'));
    expect(res.status).toBe(200);

    const args = vi.mocked(prisma.user.findUnique).mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: { userCertifications: unknown };
    };
    expect(args.where).toEqual(expect.objectContaining({ id: USER_ID }));
    expect(args.select.userCertifications).toEqual({
      where: { status: { not: 'rejected' } },
      select: { certName: true, status: true },
    });
  });

  it('a pending certification still counts toward matchPct, the same as approved', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: USER_ID } as never);
    vi.mocked(prisma.job.findMany).mockResolvedValue([job('job-1')] as never);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      member([{ certName: 'CompTIA A+', status: 'approved' }]) as never,
    );
    const approved = await ((await (GET as unknown as (req: Request) => Promise<Response>)(new Request('http://localhost'))).json());

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
      member([{ certName: 'CompTIA A+', status: 'pending' }]) as never,
    );
    const pending = await ((await (GET as unknown as (req: Request) => Promise<Response>)(new Request('http://localhost'))).json());

    expect(approved.jobs[0].matchPct).toBe(25);
    expect(pending.jobs[0].matchPct).toBe(25);
  });
});
