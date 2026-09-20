import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pacing = vi.hoisted(() => ({
  create: vi.fn(),
  run: vi.fn<(operation: () => Promise<unknown>) => Promise<unknown>>(),
}));

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

vi.mock('@/lib/db/prisma', () => {
  const atRiskAlert = {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const user = {
    findMany: vi.fn(async () => []),
  };
  const memberNudgeLog = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
  };
  return { prisma: { $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }), atRiskAlert, user, memberNudgeLog } };
});

vi.mock('@/lib/member/atRiskScoring', () => ({
  calculateAllAtRiskScores: vi.fn(),
  loadPersistedAtRiskScores: vi.fn(async () => []),
  persistAtRiskAlert: vi.fn(async () => undefined),
  buildMemberClassificationInput: vi.fn(async () => ({})),
  classifyMember: vi.fn(() => ({ tier: 'green', reasons: [], daysSinceLogin: 0 })),
  getRiskLevel: vi.fn((score: number) => {
    if (score >= 70) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }),
  THRESHOLDS: { CRITICAL: 70, HIGH: 50, MEDIUM: 30, LOW: 0 },
}));

vi.mock('@/lib/email', () => ({
  sendCounselorAtRiskAlertEmail: vi.fn(),
  getAtRiskDigestRecipients: vi.fn(() => [] as string[]),
  sendMemberCheckInEmail: vi.fn(async () => ({ ok: true })),
  sendMemberComeBackEmail: vi.fn(async () => ({ ok: true })),
  sendMemberStuckEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: pacing.create,
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: vi.fn((_key: string, handler: any) => {
    return async function(request: Request) {
      const { authorizeCronRequest } = await import('@/lib/cron/authorizeCronRequest');
      const unauthorized = authorizeCronRequest(request);
      if (unauthorized) return unauthorized;
      return handler(request);
    };
  }),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as runAtRiskAlerts } from '@/app/api/cron/at-risk-alerts/route';
import { GET as runAtRiskCheck } from '@/app/api/cron/at-risk-check/route';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { calculateAllAtRiskScores, classifyMember, getRiskLevel, loadPersistedAtRiskScores, persistAtRiskAlert } from '@/lib/member/atRiskScoring';
import { getAtRiskDigestRecipients, sendCounselorAtRiskAlertEmail, sendMemberCheckInEmail } from '@/lib/email';
import { prisma } from '@/lib/db/prisma';
import { counselorAtRiskBatchHtml } from '@/emails/counselor-at-risk-alert';

// ─── Helpers ───
function makeRequest(headers?: Record<string, string>): any {
  return new Request('http://localhost/api/cron/at-risk-alerts', {
    headers: headers ?? {},
  });
}

function mockScores(overrides: Array<Partial<{ userId: string; score: number; factors: any[]; recommendedAction: string }>> = []) {
  const defaults = [
    { userId: 'user-1', score: 75, factors: [{ description: 'No login in 14 days' }], recommendedAction: 'Immediate outreach needed' },
    { userId: 'user-2', score: 80, factors: [{ description: 'Incomplete assessment' }], recommendedAction: 'Schedule call within 24 hours' },
    { userId: 'user-3', score: 65, factors: [{ description: 'No resume' }], recommendedAction: 'Monitor' },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i], ...o })) as any : defaults;
}

function mockMembers(overrides: Array<Partial<{ id: string; fullName: string; email: string; counselorAssignments: any[] }>> = []) {
  const defaults = [
    {
      id: 'user-1',
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }],
    },
    {
      id: 'user-2',
      fullName: 'Bob Jones',
      email: 'bob@example.com',
      counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }],
    },
    {
      id: 'user-3',
      fullName: 'Carol White',
      email: 'carol@example.com',
      counselorAssignments: [{ counselor: { id: 'counselor-2', user: { email: 'c2@example.com', fullName: 'Counselor Two' } } }],
    },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i], ...o })) as any : defaults;
}

function mockAlerts(overrides: Array<Partial<{ id: string; userId: string; notifiedCounselorAt: Date | null }>> = []) {
  const defaults = [
    { id: 'alert-1', userId: 'user-1', notifiedCounselorAt: null },
    { id: 'alert-2', userId: 'user-2', notifiedCounselorAt: null },
    { id: 'alert-3', userId: 'user-3', notifiedCounselorAt: null },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i], ...o })) as any : defaults;
}

// ─── Tests ───
describe('GET /api/cron/at-risk-alerts — the weekly at-risk email from persisted scores (WAP-30)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pacing.run.mockImplementation(async (operation) => operation());
    pacing.create.mockReturnValue({
      run: pacing.run,
      deadlineAtMs: Date.now() + 270_000,
      waitForSendSlot: vi.fn(),
      summary: vi.fn(() => ({ admitted: pacing.run.mock.calls.length, skipped: 0 })),
    });
    process.env.CRON_SECRET = 'super-secret-cron-key';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('cron auth', () => {
    it('returns 401 without CRON_SECRET', async () => {
      const req = makeRequest();
      const result = await runAtRiskAlerts(req);
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong CRON_SECRET', async () => {
      const req = makeRequest({
        'x-cron-secret': 'wrong-secret',
      });
      const result = await runAtRiskAlerts(req);
      expect(result.status).toBe(401);
    });

    it('allows request with valid x-cron-secret header', async () => {
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue([]);

      const req = makeRequest({
        'x-cron-secret': 'super-secret-cron-key',
      });
      const result = await runAtRiskAlerts(req);
      expect(result.status).toBe(200);
    });

    it('the nightly at-risk-check scores and persists but sends no email (single scorer)', async () => {
      vi.mocked(calculateAllAtRiskScores).mockResolvedValue(mockScores());
      vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValueOnce([]); // stale-alert sweep
      const result = await runAtRiskCheck(
        new Request('http://localhost/api/cron/at-risk-check', { headers: { 'x-cron-secret': 'super-secret-cron-key' } }),
      );
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.scored).toBe(3);
      expect(body.counselorAlerts).toBeUndefined();
      expect(persistAtRiskAlert).toHaveBeenCalledTimes(3);
      expect(sendCounselorAtRiskAlertEmail).not.toHaveBeenCalled();
      expect(loadPersistedAtRiskScores).not.toHaveBeenCalled();
    });

    it('the weekly alert never re-scores: it reads the persisted AtRiskAlert picture', async () => {
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue([]);
      const result = await runAtRiskAlerts(makeRequest({ 'x-cron-secret': 'super-secret-cron-key' }));
      expect(result.status).toBe(200);
      expect(loadPersistedAtRiskScores).toHaveBeenCalledWith(70);
      expect(calculateAllAtRiskScores).not.toHaveBeenCalled();
    });
  });

  describe('alerts sent for score >= 70', () => {
    it('sends alerts only for CRITICAL members (score >= 70)', async () => {
      const scores = mockScores();
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);

      // user-3 has score 65 (< 70) so no alert should be sent for them
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers());
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([]) // existingAlerts
        .mockResolvedValueOnce(mockAlerts()); // alerts (second call)
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 3 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 2 } as any);

      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.success).toBe(true);
      expect(body.counselorAlerts.membersFlagged).toBe(2); // only user-1 and user-2
      expect(body.counselorAlerts.counselorsNotified).toBe(1); // both user-1 and user-2 share counselor-1
      expect(sendCounselorAtRiskAlertEmail).toHaveBeenCalledTimes(1);

      const callArgs = vi.mocked(sendCounselorAtRiskAlertEmail).mock.calls[0][0];
      expect(callArgs.members).toHaveLength(2);
      expect(callArgs.members.map((m: any) => m.score)).toEqual([75, 80]);
    });

    it('returns empty result when no critical members', async () => {
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue([
        { userId: 'user-1', score: 45, factors: [], recommendedAction: 'Monitor' },
      ] as any);

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts).toEqual({
        success: true,
        counselorsNotified: 0,
        membersFlagged: 0,
        skippedNoCounselor: 0,
        unassignedRoutedToStaff: 0,
        skippedAlreadyNotified: 0,
        skippedPacing: 0,
        skippedFixture: 0,
        results: [],
      });
      expect(sendCounselorAtRiskAlertEmail).not.toHaveBeenCalled();
    });
  });

  describe('deduplication (24h window)', () => {
    it('skips members already notified within 24 hours', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const scores = mockScores();
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers());

      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([]) // existingAlerts
        .mockResolvedValueOnce([
          { id: 'alert-1', userId: 'user-1', notifiedCounselorAt: oneHourAgo },
          { id: 'alert-2', userId: 'user-2', notifiedCounselorAt: null },
          { id: 'alert-3', userId: 'user-3', notifiedCounselorAt: null },
        ] as any);

      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 3 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.skippedAlreadyNotified).toBe(1); // user-1 skipped
      expect(body.counselorAlerts.membersFlagged).toBe(1); // only user-2
      const callArgs = vi.mocked(sendCounselorAtRiskAlertEmail).mock.calls[0][0];
      expect(callArgs.members).toHaveLength(1);
      expect(callArgs.members[0].memberName).toBe('Bob Jones');
    });

    it('includes members notified more than 24 hours ago', async () => {
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const scores = mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'No login' }], recommendedAction: 'Call' },
      ]);
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers([
        { id: 'user-1', fullName: 'Alice Smith', email: 'alice@example.com', counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }] },
      ]));

      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'alert-1', userId: 'user-1', notifiedCounselorAt: thirtyHoursAgo },
        ] as any);

      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.skippedAlreadyNotified).toBe(0);
      expect(body.counselorAlerts.membersFlagged).toBe(1);
    });
  });

  describe('shared provider pacing', () => {
    it('routes counselor and member sends through one request-scoped pacer', async () => {
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'No login' }], recommendedAction: 'Call' },
      ]));
      vi.mocked(prisma.user.findMany)
        .mockResolvedValueOnce(mockMembers([
          { id: 'user-1', fullName: 'Alice Smith', email: 'alice@example.com', counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }] },
        ]))
        .mockResolvedValueOnce(mockMembers([
          { id: 'user-2', fullName: 'Bob Jones', email: 'bob@example.com', counselorAssignments: [] },
        ]));
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'alert-1', userId: 'user-1', notifiedCounselorAt: null }] as any);
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });
      vi.mocked(classifyMember).mockReturnValue({ tier: 'yellow', reasons: ['inactive'], daysSinceLogin: 11 } as any);
      vi.mocked(sendMemberCheckInEmail).mockResolvedValue({ ok: true });

      const result = await runAtRiskAlerts(makeRequest({ 'x-cron-secret': 'super-secret-cron-key' }));
      expect(result.status).toBe(200);
      expect(pacing.create).toHaveBeenCalledOnce();
      expect(pacing.run).toHaveBeenCalledTimes(2);
      expect(sendCounselorAtRiskAlertEmail).toHaveBeenCalledOnce();
      expect(sendMemberCheckInEmail).toHaveBeenCalledOnce();
    });
  });

  describe('fixture skip accounting', () => {
    it('does not count fixture-skipped counselor or member sends as sent or failed', async () => {
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'No login' }], recommendedAction: 'Call' },
      ]));
      vi.mocked(prisma.user.findMany)
        .mockResolvedValueOnce(mockMembers([{ id: 'user-1', fullName: 'Fixture', email: 'fixture@example.com', counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'fixture-counselor@example.com', fullName: 'Fixture Counselor' } } }] }]))
        .mockResolvedValueOnce(mockMembers([{ id: 'user-2', fullName: 'Fixture Member', email: 'member@example.com', counselorAssignments: [] }]));
      vi.mocked(prisma.atRiskAlert.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'alert-1', userId: 'user-1', notifiedCounselorAt: null }] as any);
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(classifyMember).mockReturnValue({ tier: 'yellow', reasons: ['inactive'], daysSinceLogin: 11 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: false, skipped: true, error: 'fixture_recipient' } as any);
      vi.mocked(sendMemberCheckInEmail).mockResolvedValue({ ok: false, skipped: true, error: 'fixture_recipient' } as any);

      const response = await runAtRiskAlerts(makeRequest({ 'x-cron-secret': 'super-secret-cron-key' }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.counselorAlerts.counselorsNotified).toBe(0);
      expect(body.counselorAlerts.skippedFixture).toBe(1);
      expect(body.memberNudges.sentCheckIn).toBe(0);
      expect(body.memberNudges.errors).toBe(0);
      expect(body.memberNudges.skippedFixture).toBe(1);
      expect(prisma.atRiskAlert.updateMany).not.toHaveBeenCalled();
      expect(prisma.memberNudgeLog.create).not.toHaveBeenCalled();
    });
  });

  describe('batching by counselor', () => {
    it('groups members by counselor into separate emails', async () => {
      const scores = mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'A' }], recommendedAction: 'Call' },
        { userId: 'user-2', score: 80, factors: [{ description: 'B' }], recommendedAction: 'Call' },
        { userId: 'user-3', score: 72, factors: [{ description: 'C' }], recommendedAction: 'Call' },
      ]);
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers());
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockAlerts());
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 3 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 3 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.counselorsNotified).toBe(2);
      expect(sendCounselorAtRiskAlertEmail).toHaveBeenCalledTimes(2);

      // Counselor 1 has 2 members
      const counselor1Call = vi.mocked(sendCounselorAtRiskAlertEmail).mock.calls.find(
        (call) => call[0].to === 'c1@example.com'
      );
      expect(counselor1Call).toBeDefined();
      expect(counselor1Call![0].members).toHaveLength(2);

      // Counselor 2 has 1 member
      const counselor2Call = vi.mocked(sendCounselorAtRiskAlertEmail).mock.calls.find(
        (call) => call[0].to === 'c2@example.com'
      );
      expect(counselor2Call).toBeDefined();
      expect(counselor2Call![0].members).toHaveLength(1);
    });

    it('increments skippedNoCounselor for members without counselor', async () => {
      const scores = mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'A' }], recommendedAction: 'Call' },
        { userId: 'user-2', score: 80, factors: [{ description: 'B' }], recommendedAction: 'Call' },
      ]);
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers([
        {
          id: 'user-1',
          fullName: 'Alice Smith',
          email: 'alice@example.com',
          counselorAssignments: [], // no counselor
        },
        {
          id: 'user-2',
          fullName: 'Bob Jones',
          email: 'bob@example.com',
          counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }],
        },
      ]));
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockAlerts());
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.skippedNoCounselor).toBe(1);
      expect(body.counselorAlerts.membersFlagged).toBe(1); // only Bob
      expect(sendCounselorAtRiskAlertEmail).toHaveBeenCalledTimes(1);
    });

    it('routes critical members with no counselor to the staff fallback inbox instead of dropping them', async () => {
      vi.mocked(getAtRiskDigestRecipients).mockReturnValue(['ops@example.com', 'lead@example.com']);
      const scores = mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'A' }], recommendedAction: 'Call' },
        { userId: 'user-2', score: 80, factors: [{ description: 'B' }], recommendedAction: 'Call' },
      ]);
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers([
        { id: 'user-1', fullName: 'Alice Smith', email: 'alice@example.com', counselorAssignments: [] },
        { id: 'user-2', fullName: 'Bob Jones', email: 'bob@example.com', counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }] },
      ]));
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockAlerts());
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.atRiskAlert.updateMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: true });

      const result = await runAtRiskAlerts(makeRequest({ 'x-cron-secret': 'super-secret-cron-key' }));
      const body = await result.json();

      expect(body.counselorAlerts.skippedNoCounselor).toBe(0);
      expect(body.counselorAlerts.unassignedRoutedToStaff).toBe(1);
      expect(body.counselorAlerts.membersFlagged).toBe(2);
      expect(body.counselorAlerts.counselorsNotified).toBe(2);
      expect(sendCounselorAtRiskAlertEmail).toHaveBeenCalledTimes(2);
      const staffCall = vi.mocked(sendCounselorAtRiskAlertEmail).mock.calls.find((call) => Array.isArray(call[0].to));
      expect(staffCall).toBeDefined();
      expect(staffCall![0].to).toEqual(['ops@example.com', 'lead@example.com']);
      expect(staffCall![0].members[0].memberName).toBe('Alice Smith');
      expect(staffCall![0].members[0].profileUrl).toContain('/admin/members/user-1');
      const staffResult = body.counselorAlerts.results.find((r: { counselorId: string }) => r.counselorId === 'staff-fallback');
      expect(staffResult).toMatchObject({ sent: true, memberCount: 1 });
    });
  });

  describe('email failure handling', () => {
    it('does not update notifiedCounselorAt when email fails', async () => {
      const scores = mockScores([
        { userId: 'user-1', score: 75, factors: [{ description: 'A' }], recommendedAction: 'Call' },
      ]);
      vi.mocked(loadPersistedAtRiskScores).mockResolvedValue(scores);
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers([
        { id: 'user-1', fullName: 'Alice Smith', email: 'alice@example.com', counselorAssignments: [{ counselor: { id: 'counselor-1', user: { email: 'c1@example.com', fullName: 'Counselor One' } } }] },
      ]));
      vi.mocked(prisma.atRiskAlert.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'alert-1', userId: 'user-1', notifiedCounselorAt: null }] as any);
      vi.mocked(prisma.atRiskAlert.createMany).mockResolvedValue({ count: 1 } as any);
      vi.mocked(sendCounselorAtRiskAlertEmail).mockResolvedValue({ ok: false, error: 'SMTP down' });

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runAtRiskAlerts(req);
      const body = await result.json();

      expect(body.counselorAlerts.counselorsNotified).toBe(0);
      expect(body.counselorAlerts.results[0].sent).toBe(false);
      expect(body.counselorAlerts.results[0].error).toBe('SMTP down');
      expect(prisma.atRiskAlert.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('authorizeCronRequest', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('returns null when bearer token matches CRON_SECRET', () => {
    const req = new Request('http://localhost/', {
      headers: { authorization: 'Bearer test-cron-secret' },
    });
    expect(authorizeCronRequest(req)).toBeNull();
  });

  it('returns null when x-cron-secret matches CRON_SECRET', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-cron-secret': 'test-cron-secret' },
    });
    expect(authorizeCronRequest(req)).toBeNull();
  });

  it('returns 401 when no secret provided', () => {
    const req = new Request('http://localhost/');
    const result = authorizeCronRequest(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });

  it('returns 401 when secret does not match', () => {
    const req = new Request('http://localhost/', {
      headers: { 'x-cron-secret': 'wrong-secret' },
    });
    const result = authorizeCronRequest(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });
});

describe('email template — counselorAtRiskBatchHtml', () => {
  it('renders singular subject line for 1 member', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jane',
      memberCount: 1,
      members: [
        {
          memberName: 'Alice Smith',
          memberEmail: 'alice@example.com',
          score: 75,
          level: 'CRITICAL',
          factors: ['No login in 14 days'],
          recommendedAction: 'Call immediately',
          profileUrl: 'https://example.com/counselor/students/user-1',
        },
      ],
      dashboardUrl: 'https://example.com/counselor/at-risk',
    });

    expect(html).toContain('1 member needs attention today');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('CRITICAL');
    expect(html).toContain('75');
    expect(html).toContain('Call immediately');
    expect(html).toContain('No login in 14 days');
  });

  it('renders plural subject line for multiple members', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jane',
      memberCount: 3,
      members: [
        {
          memberName: 'Alice Smith',
          memberEmail: 'alice@example.com',
          score: 75,
          level: 'CRITICAL',
          factors: ['No login in 14 days'],
          recommendedAction: 'Call immediately',
          profileUrl: 'https://example.com/counselor/students/user-1',
        },
        {
          memberName: 'Bob Jones',
          memberEmail: 'bob@example.com',
          score: 80,
          level: 'CRITICAL',
          factors: ['Stale training'],
          recommendedAction: 'Schedule session',
          profileUrl: 'https://example.com/counselor/students/user-2',
        },
        {
          memberName: 'Carol White',
          memberEmail: 'carol@example.com',
          score: 72,
          level: 'CRITICAL',
          factors: ['No resume'],
          recommendedAction: 'Check in',
          profileUrl: 'https://example.com/counselor/students/user-3',
        },
      ],
      dashboardUrl: 'https://example.com/counselor/at-risk',
    });

    expect(html).toContain('3 members need attention today');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('Bob Jones');
    expect(html).toContain('Carol White');
  });

  it('renders member card with profile link', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jane',
      memberCount: 1,
      members: [
        {
          memberName: 'Alice Smith',
          memberEmail: 'alice@example.com',
          score: 75,
          level: 'CRITICAL',
          factors: ['No login in 14 days'],
          recommendedAction: 'Call immediately',
          profileUrl: 'https://example.com/counselor/students/user-1',
        },
      ],
      dashboardUrl: 'https://example.com/counselor/at-risk',
    });

    expect(html).toContain('View profile');
    expect(html).toContain('https://example.com/counselor/students/user-1');
  });

  it('renders CTA link to at-risk dashboard', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jane',
      memberCount: 2,
      members: [
        {
          memberName: 'Alice Smith',
          memberEmail: 'alice@example.com',
          score: 75,
          level: 'CRITICAL',
          factors: [],
          recommendedAction: 'Call',
          profileUrl: 'https://example.com/counselor/students/user-1',
        },
        {
          memberName: 'Bob Jones',
          memberEmail: 'bob@example.com',
          score: 80,
          level: 'CRITICAL',
          factors: [],
          recommendedAction: 'Call',
          profileUrl: 'https://example.com/counselor/students/user-2',
        },
      ],
      dashboardUrl: 'https://example.com/counselor/at-risk',
    });

    expect(html).toContain('Open at-risk dashboard');
    expect(html).toContain('https://example.com/counselor/at-risk');
  });

  it('escapes HTML in member names and factors', () => {
    const html = counselorAtRiskBatchHtml({
      counselorName: 'Jane',
      memberCount: 1,
      members: [
        {
          memberName: '<script>alert(1)</script>',
          memberEmail: 'test@example.com',
          score: 75,
          level: 'CRITICAL',
          factors: ['<b>bold</b> factor'],
          recommendedAction: 'Call',
          profileUrl: 'https://example.com/counselor/students/user-1',
        },
      ],
      dashboardUrl: 'https://example.com/counselor/at-risk',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });
});
