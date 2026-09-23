import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('GET /api/cron/at-risk-check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
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

  it('resolves stale alerts for members no longer at risk', async () => {
    const scores = [{ userId: 'user-1', score: 20, factors: [], recommendedAction: '' }];
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue(scores as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([
      { id: 'alert-1' },
      { id: 'alert-2' },
    ] as any);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alertsResolved).toBe(2);
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'resolved' }),
      })
    );
  });

  it('excludes member-reported escalations in the query so they cannot starve the take:100 batch', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([] as any);
    vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValue([] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const args = vi.mocked(prisma.atRiskAlert.findMany).mock.calls[0]?.[0] as any;
    expect(args.take).toBe(100);
    expect(args.where.status).toEqual({ in: ['open', 'acknowledged'] });
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
        factors: [{ name: 'no_login_7_days', weight: 25, description: 'No login in 7 days' }],
      },
    ] as any);

    const res = await atRiskGET(makeAuthorizedCronRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.alertsResolved).toBe(1);
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.atRiskAlert.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['alert-scorer-only'] } },
      data: { status: 'resolved', resolvedAt: expect.any(Date) },
    });
  });

  it('does not call updateMany when every returned row is member-reported', async () => {
    vi.mocked(calculateAllAtRiskScores).mockResolvedValue([] as any);
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
