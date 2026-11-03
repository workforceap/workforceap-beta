import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AtRiskAlert, Prisma } from '@prisma/client';

// ─── Set env before route module loads ───
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.workforceap.org';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    atRiskAlert: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/member/atRiskScoring', () => ({
  calculateAllAtRiskScores: vi.fn(),
  persistAtRiskAlert: vi.fn(),
  getRiskLevel: vi.fn((score: number) => {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    return 'medium';
  }),
  THRESHOLDS: { CRITICAL: 80, HIGH: 60, MEDIUM: 40 },
}));


vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key, handler) => handler),
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as atRiskGET, POST as atRiskPOST } from '@/app/api/cron/at-risk-check/route';
import { prisma } from '@/lib/db/prisma';
import { calculateAllAtRiskScores, persistAtRiskAlert } from '@/lib/member/atRiskScoring';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

function makeCronRequest(method = 'GET', headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/cron/at-risk-check', {
    method,
    headers,
  });
}

function makeAuthorizedCronRequest(method = 'GET') {
  return makeCronRequest(method, { authorization: 'Bearer test-cron-secret' });
}

function resolvedPrismaPromise<T>(value: T): Prisma.PrismaPromise<T> {
  const promise = new Promise<T>((resolve) => resolve(value));
  return {
    [Symbol.toStringTag]: 'PrismaPromise',
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

describe('GET /api/cron/at-risk-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns 401 without cron auth and does not run side effects', async () => {
    const res = await atRiskGET(makeCronRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(calculateAllAtRiskScores).not.toHaveBeenCalled();
    expect(persistAtRiskAlert).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
    expect(logCronRun).not.toHaveBeenCalled();
  });

  it('returns 401 for POST without cron auth and does not run side effects', async () => {
    const res = await atRiskPOST(makeCronRequest('POST'));
    expect(res.status).toBe(401);
    expect(calculateAllAtRiskScores).not.toHaveBeenCalled();
    expect(persistAtRiskAlert).not.toHaveBeenCalled();
  });

  it('scores members and persists alerts for medium+ risk', async () => {
    const scores = [
      { userId: 'user-1', score: 85, factors: [{ description: 'No login 30d' }], recommendedAction: 'Reach out' },
      { userId: 'user-2', score: 50, factors: [{ description: 'Late submission' }], recommendedAction: 'Check in' },
      { userId: 'user-3', score: 20, factors: [], recommendedAction: '' },
    ];
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue(scores as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-1', email: 'a@example.com', fullName: 'Alice' },
    ] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scored).toBe(3);
    expect(json.critical).toBe(1);
    expect(json.high).toBe(0);
    expect(json.medium).toBe(1);
    expect(json.alertsCreated).toBe(2);
    expect(persistAtRiskAlert).toHaveBeenCalledTimes(2);
  });

  it('resolves stale alerts only for members this run scored below medium', async () => {
    const scores = [{ userId: 'user-1', score: 20, factors: [], recommendedAction: '' }];
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue(scores as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([
      { id: 'alert-1', updatedAt: new Date('2026-01-01') },
      { id: 'alert-2', updatedAt: new Date('2026-01-01') },
    ] as any);
    vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alertsResolved).toBe(2);
    expect(prisma.atRiskAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['user-1'] },
        }),
      }),
    );
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'resolved' }),
      })
    );
  });

  it('does not treat unscored members as no longer at risk', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
      { userId: 'scored-high', score: 85, factors: [{ description: 'No login' }], recommendedAction: 'Call' },
      { userId: 'scored-low', score: 10, factors: [], recommendedAction: '' },
    ] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).alertsResolved).toBe(0);
    const args = vi.mocked(prisma.atRiskAlert.findMany).mock.calls[0]?.[0] as { where: { userId: { in: string[] } } };
    expect(args.where.userId.in).toEqual(['scored-low']);
    expect(args.where.userId.in).not.toContain('scored-high');
    expect(args.where.userId.in).not.toContain('never-scored');
    expect(persistAtRiskAlert).toHaveBeenCalledTimes(1);
  });

  it('keeps every open alert when the scorer returns no members', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).alertsResolved).toBe(0);
    expect(prisma.atRiskAlert.findMany).not.toHaveBeenCalled();
    expect(prisma.atRiskAlert.updateMany).not.toHaveBeenCalled();
  });

  it('excludes member-reported escalations in the query so they cannot starve the take:100 batch', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
      { userId: 'user-low', score: 10, factors: [], recommendedAction: '' },
    ] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.atRiskAlert.findMany).mock.calls[0]?.[0] as any;
    expect(args.take).toBe(100);
    expect(args.where.status).toEqual({ in: ['open', 'acknowledged'] });
    expect(args.where.userId).toEqual({ in: ['user-low'] });
    expect(args.where.NOT).toEqual({
      OR: [
        { factors: { array_contains: [{ name: 'first90_trouble_reported' }] } },
        { factors: { array_contains: [{ name: 'placement_survey_job_loss_reported' }] } },
      ],
    });
    expect(args.select).toEqual(expect.objectContaining({ id: true, factors: true }));
    expect(prisma.atRiskAlert.updateMany).not.toHaveBeenCalled();
  });

  it('never resolves a returned row that carries a member-reported factor, but still resolves scorer-only stale alerts', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
      { userId: 'user-low', score: 10, factors: [], recommendedAction: '' },
    ] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([
      {
        id: 'alert-member-reported',
        factors: [
          { name: 'no_login_7_days', weight: 25, description: 'No login in 7 days' },
          { name: 'first90_trouble_reported', weight: 1, description: 'Member said they are having trouble' },
        ],
      },
      {
        id: 'alert-job-loss',
        factors: [{ name: 'placement_survey_job_loss_reported', weight: 1, description: 'Lost job' }],
      },
      {
        id: 'alert-scorer-only',
        updatedAt: new Date('2026-01-01'),
        factors: [{ name: 'no_login_7_days', weight: 25, description: 'No login in 7 days' }],
      },
    ] as any);
    vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 });

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alertsResolved).toBe(1);
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ id: 'alert-scorer-only', updatedAt: new Date('2026-01-01') }],
      }),
      data: { status: 'resolved', resolvedAt: expect.any(Date) },
    });
  });

  it.each(['member escalation', 'new scorer result', 'staff resolution'] as const)(
    'preserves a newer %s written between the candidate read and resolution',
    async (change) => {
      const row = {
        id: 'alert-racing',
        userId: 'user-low',
        status: 'open',
        score: 55,
        factors: [{ name: 'no_login_7_days' }],
        counselorId: null,
        acknowledgedAt: null,
        resolvedAt: null,
        notifiedCounselorAt: null,
        escalatedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      } satisfies AtRiskAlert;
      vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
        { userId: row.userId, score: 10, factors: [], recommendedAction: '' },
      ] as any);
      vi.mocked(prisma.atRiskAlert.findMany).mockImplementationOnce(() => {
        const snapshot = { ...row, factors: [...row.factors] };
        if (change === 'member escalation') row.factors.push({ name: 'first90_trouble_reported' });
        if (change === 'new scorer result') row.score = 90;
        if (change === 'staff resolution') row.status = 'resolved';
        row.updatedAt = new Date(Date.now() + 1_000);
        return resolvedPrismaPromise([snapshot]);
      });
      vi.mocked(prisma.atRiskAlert.updateMany).mockImplementationOnce((args) => {
        // In-memory predicate evaluator models the interleaved writer; this is
        // route behavior coverage, not evidence of PostgreSQL isolation.
        const where = args?.where as {
          id?: { in: string[] };
          status?: { in: string[] };
          userId?: { in: string[] };
          updatedAt?: { lt: Date };
          OR?: Array<{ id: string; updatedAt: Date }>;
          NOT?: { OR: Array<{ factors: { array_contains: Array<{ name: string }> } }> };
        };
        const matches = (!where.id || where.id.in.includes(row.id))
          && (!where.status || where.status.in.includes(row.status))
          && (!where.userId || where.userId.in.includes(row.userId))
          && (!where.updatedAt || row.updatedAt < where.updatedAt.lt)
          && (!where.OR || where.OR.some((revision) => revision.id === row.id
            && revision.updatedAt.getTime() === row.updatedAt.getTime()))
          && (!where.NOT || !where.NOT.OR.some((excluded) =>
            excluded.factors.array_contains.some((factor) =>
              row.factors.some((current) => current.name === factor.name))));
        if (matches) row.status = 'resolved';
        return resolvedPrismaPromise({ count: Number(matches) });
      });

      const response = await atRiskGET(makeAuthorizedCronRequest());

      expect(response.status).toBe(200);
      expect((await response.json()).alertsResolved).toBe(0);
      expect(row.status).toBe(change === 'staff resolution' ? 'resolved' : 'open');
      expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it('does not call updateMany when every returned row is member-reported', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
      { userId: 'user-low', score: 10, factors: [], recommendedAction: '' },
    ] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([
      { id: 'alert-member-reported', factors: [{ name: 'first90_trouble_reported' }] },
    ] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    const json = await res.json();
    expect(json.alertsResolved).toBe(0);
    expect(prisma.atRiskAlert.updateMany).not.toHaveBeenCalled();
  });

  it('sends no email: the weekly at-risk-alerts cron reads the persisted rows instead', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([
      { userId: 'user-1', score: 85, factors: [{ description: 'No login' }], recommendedAction: 'Call' },
    ] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alertsCreated).toBe(1);
    expect(json.counselorAlerts).toBeUndefined();
    expect(json.digestEmailSent).toBeUndefined();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(logCronRun).toHaveBeenCalledWith('cron_at_risk_check', expect.any(Object), 'ok');
  });
});
