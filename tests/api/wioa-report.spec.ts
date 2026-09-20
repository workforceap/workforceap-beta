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
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const user = {
    count: vi.fn(),
    findMany: vi.fn(),
  };
  const courseEnrollment = {
    count: vi.fn(),
    groupBy: vi.fn(),
  };
  const courseProgress = {
    groupBy: vi.fn(),
  };
  const placementRecord = {
    count: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  };
  const cronExecution = {
    create: vi.fn(async () => ({ id: 'cron-exec-1', startedAt: new Date() })),
    findUnique: vi.fn(async () => ({ startedAt: new Date() })),
    update: vi.fn(async () => ({})),
  };
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), user, courseEnrollment, courseProgress, placementRecord, cronExecution } };
});

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/cron/wioa-report', () => ({
  generateWioaReport: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendWioaReportEmail: vi.fn(),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

vi.mock('@/lib/cron/authorizeCronRequest', () => ({
  authorizeCronRequest: vi.fn(),
}));

vi.mock('@/lib/cron/isCronEnabled', () => ({
  isCronEnabled: vi.fn(async () => true),
}));

// ─── Imports after mocks ───
import { GET as getWioaReport } from '@/app/api/admin/reports/wioa/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { generateWioaReport } from '@/lib/cron/wioa-report';
import { sendWioaReportEmail } from '@/lib/email';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { isCronEnabled } from '@/lib/cron/isCronEnabled';
import { NextRequest } from 'next/server';

// Cron handlers imported separately so withCronLogging resolves mocks
import { GET as runWioaCron, POST as runWioaCronPost } from '@/app/api/cron/wioa-report/route';

describe('GET /api/admin/reports/wioa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await getWioaReport(new NextRequest('http://localhost:3000/api/admin/reports/wioa'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns quarterly report with demographics and program breakdown', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(prisma.user.count).mockResolvedValue(120);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValue(95);
    vi.mocked(prisma.courseProgress.groupBy).mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }] as any);
    vi.mocked(prisma.placementRecord.count).mockResolvedValue(45);
    vi.mocked(prisma.placementRecord.aggregate).mockResolvedValue({ _avg: { salaryOffered: 52000 } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { profile: { ethnicity: 'Hispanic', veteranStatus: 'No', educationLevel: 'HS', state: 'TX' } },
      { profile: { ethnicity: 'Black', veteranStatus: 'Yes', educationLevel: 'BA', state: 'TX' } },
      { profile: { ethnicity: 'Hispanic', veteranStatus: 'No', educationLevel: 'HS', state: 'CA' } },
    ] as any);
    vi.mocked(prisma.courseEnrollment.groupBy).mockResolvedValue([
      { programSlug: 'cna', _count: { programSlug: 50 } },
      { programSlug: 'it-support', _count: { programSlug: 30 } },
    ] as any);

    const res = await getWioaReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa?year=2025&quarter=Q1&state=TX')
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.year).toBe(2025);
    expect(body.quarter).toBe('Q1');
    expect(body.state).toBe('TX');
    expect(body.totalMembers).toBe(120);
    expect(body.enrolledMembers).toBe(95);
    expect(body.completedMembers).toBe(2);
    expect(body.placedMembers).toBe(45);
    expect(body.avgSalary).toBe(52000);

    expect(body.demographics).toMatchObject({
      ethnicity: { Hispanic: 2, Black: 1 },
      veteranStatus: { No: 2, Yes: 1 },
      educationLevel: { HS: 2, BA: 1 },
      state: { TX: 2, CA: 1 },
    });

    expect(body.programs).toEqual([
      { programSlug: 'cna', _count: { programSlug: 50 } },
      { programSlug: 'it-support', _count: { programSlug: 30 } },
    ]);
  });

  it('defaults to full-year when quarter is omitted', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');

    vi.mocked(prisma.user.count).mockResolvedValue(500);
    vi.mocked(prisma.courseEnrollment.count).mockResolvedValue(0);
    vi.mocked(prisma.courseProgress.groupBy).mockResolvedValue([] as any);
    vi.mocked(prisma.placementRecord.count).mockResolvedValue(0);
    vi.mocked(prisma.placementRecord.aggregate).mockResolvedValue({ _avg: { salaryOffered: null } } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.courseEnrollment.groupBy).mockResolvedValue([] as any);

    const res = await getWioaReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa?year=2024')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(2024);
    expect(body.quarter).toBeUndefined();
    expect(body.totalMembers).toBe(500);
  });
});

describe('POST /api/admin/reports/wioa/generate', () => {
  let generateReport: typeof import('@/app/api/admin/reports/wioa/generate/route').POST;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('@/app/api/admin/reports/wioa/generate/route');
    generateReport = mod.POST;
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await generateReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(403);
  });

  it('generates report for custom period', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const mockReport = {
      generatedAt: '2025-01-15T00:00:00.000Z',
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
      totalActiveMembers: 100,
      totalCompleters: 80,
      totalPlacements: 40,
      overallAvgWage: 55000,
      programs: [],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);

    const res = await generateReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ periodStart: '2025-01-01', periodEnd: '2025-01-31' }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toMatchObject(mockReport);
    expect(generateWioaReport).toHaveBeenCalledWith({
      start: new Date('2025-01-01'),
      end: new Date('2025-01-31'),
    });
  });

  it('generates report for previous month when no period provided', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const mockReport = {
      generatedAt: new Date().toISOString(),
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      totalActiveMembers: 50,
      totalCompleters: 30,
      totalPlacements: 15,
      overallAvgWage: 48000,
      programs: [],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);

    const res = await generateReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa/generate', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(200);
    expect(generateWioaReport).toHaveBeenCalledWith(undefined);
  });

  it('handles invalid JSON body gracefully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'admin-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    const mockReport = {
      generatedAt: new Date().toISOString(),
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      totalActiveMembers: 10,
      totalCompleters: 5,
      totalPlacements: 2,
      overallAvgWage: 40000,
      programs: [],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);

    const res = await generateReport(
      new NextRequest('http://localhost:3000/api/admin/reports/wioa/generate', {
        method: 'POST',
        body: 'not-valid-json',
      })
    );
    expect(res.status).toBe(200);
    expect(generateWioaReport).toHaveBeenCalledWith(undefined);
  });
});

describe('GET /api/cron/wioa-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizeCronRequest).mockReturnValue(null);
    vi.mocked(isCronEnabled).mockResolvedValue(true);
  });

  it('returns 401 without valid CRON_SECRET', async () => {
    vi.mocked(authorizeCronRequest).mockReturnValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }) as unknown as import('next/server').NextResponse
    );

    const res = await runWioaCron(new Request('http://localhost:3000/api/cron/wioa-report'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('generates report and sends email successfully', async () => {
    const mockReport = {
      periodStart: '2025-01-15T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
      totalActiveMembers: 100,
      totalCompleters: 80,
      totalPlacements: 40,
      overallAvgWage: 55000,
      programs: [{ programSlug: 'cna', activeMembers: 50, completers: 40, placements: 20, avgWage: 52000 }],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);
    vi.mocked(sendWioaReportEmail).mockResolvedValue({ ok: true });

    const res = await runWioaCron(new Request('http://localhost:3000/api/cron/wioa-report'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report).toMatchObject(mockReport);

    const expectedLabel = new Date(mockReport.periodStart).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    expect(sendWioaReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        periodLabel: expectedLabel,
        totalActiveMembers: 100,
        totalCompleters: 80,
        totalPlacements: 40,
        overallAvgWage: 55000,
      })
    );
  });

  it('returns 500 when email delivery fails', async () => {
    const mockReport = {
      periodStart: '2025-01-15T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
      totalActiveMembers: 100,
      totalCompleters: 80,
      totalPlacements: 40,
      overallAvgWage: 55000,
      programs: [],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);
    vi.mocked(sendWioaReportEmail).mockResolvedValue({ ok: false, error: 'Resend API error' });

    const res = await runWioaCron(new Request('http://localhost:3000/api/cron/wioa-report'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Email failed');
    expect(body.detail).toBe('Resend API error');
  });

  it('POST works identically to GET', async () => {
    const mockReport = {
      periodStart: '2025-01-15T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
      totalActiveMembers: 100,
      totalCompleters: 80,
      totalPlacements: 40,
      overallAvgWage: 55000,
      programs: [],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);
    vi.mocked(sendWioaReportEmail).mockResolvedValue({ ok: true });

    const res = await runWioaCronPost(new Request('http://localhost:3000/api/cron/wioa-report'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('logs cron run on success', async () => {
    const { logCronRun } = await import('@/lib/admin/logCronRun');
    const mockReport = {
      periodStart: '2025-01-15T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
      totalActiveMembers: 100,
      totalCompleters: 80,
      totalPlacements: 40,
      overallAvgWage: 55000,
      programs: [{ programSlug: 'cna', activeMembers: 50, completers: 40, placements: 20, avgWage: 52000 }],
      rawJson: {},
    };
    vi.mocked(generateWioaReport).mockResolvedValue(mockReport as any);
    vi.mocked(sendWioaReportEmail).mockResolvedValue({ ok: true });

    await runWioaCron(new Request('http://localhost:3000/api/cron/wioa-report'));
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_wioa_report',
      expect.objectContaining({
        ok: true,
        totalActiveMembers: 100,
        totalCompleters: 80,
        totalPlacements: 40,
        overallAvgWage: 55000,
        programCount: 1,
        emailError: null,
      }),
      'ok'
    );
  });
});
