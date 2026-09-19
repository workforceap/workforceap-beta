import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    user: {
      findMany: vi.fn(),
    },
    weeklyRecap: {
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendWeeklyRecapEmail: vi.fn(),
}));

vi.mock('@/lib/recap/generate', () => ({
  generateWeeklyRecaps: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(),
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

// ─── Imports after mocks ───
import { GET as runWeeklyRecap } from '@/app/api/cron/weekly-recap/route';
import { authorizeCronRequest } from '@/lib/cron/authorizeCronRequest';
import { sendWeeklyRecapEmail } from '@/lib/email';
import { generateWeeklyRecaps } from '@/lib/recap/generate';
import { captureApiError } from '@/lib/observability/captureApiError';
import { prisma } from '@/lib/db/prisma';
import { buildWeeklyRecapEmailSummary } from '@/lib/recap/buildWeeklyRecapEmailSummary';

// ─── Helpers ───
function makeRequest(headers?: Record<string, string>): any {
  return new Request('http://localhost/api/cron/weekly-recap', {
    headers: headers ?? {},
  });
}

function mockMembers(overrides: Array<Partial<{ id: string; email: string; fullName: string; enrolledProgram: string }>> = []) {
  const defaults = [
    { id: 'user-1', email: 'alice@example.com', fullName: 'Alice Smith', enrolledProgram: 'cdl' },
    { id: 'user-2', email: 'bob@example.com', fullName: 'Bob Jones', enrolledProgram: 'tech' },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i], ...o })) as any : defaults as any;
}

function mockRecaps(overrides: Array<Partial<{ userId: string; recapData: any; score: number | null }>> = []) {
  const defaults = [
    {
      userId: 'user-1',
      recapData: {
        weekInReview: { applicationsAdded: 3, resourcesCompleted: 2, aiToolsUsed: 1, pathwayStepsCompleted: 1, newLiveJobsThisWeek: 5 },
        goalsSnapshot: [{ title: 'Complete CDL training', status: 'in_progress', currentMetricValue: 3, targetMetricValue: 5 }],
        recommendedActions: ['Build your resume with the Resume Rewriter', 'Practice interview questions'],
        readinessScoreSnapshot: 72,
        upcomingCounselorSessions: [{ at: 'Mon, May 12, 2:00 PM CDT', topic: 'Career planning' }],
      },
      score: 72,
    },
    {
      userId: 'user-2',
      recapData: {
        weekInReview: { applicationsAdded: 1, resourcesCompleted: 0, aiToolsUsed: 0, pathwayStepsCompleted: 0, newLiveJobsThisWeek: 2 },
        goalsSnapshot: [],
        recommendedActions: ['Log your first job application'],
        readinessScoreSnapshot: 45,
        upcomingCounselorSessions: [],
      },
      score: 45,
    },
  ];
  return overrides.length ? overrides.map((o, i) => ({ ...defaults[i], ...o })) as any : defaults as any;
}

// ─── Tests ───
describe('GET /api/cron/weekly-recap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'super-secret-cron-key';
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('cron auth', () => {
    it('returns 401 without CRON_SECRET', async () => {
      const req = makeRequest();
      const result = await runWeeklyRecap(req);
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 with wrong CRON_SECRET', async () => {
      const req = makeRequest({ authorization: 'Bearer wrong-secret' });
      const result = await runWeeklyRecap(req);
      expect(result.status).toBe(401);
    });

    it('allows request with valid Bearer CRON_SECRET', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue([]);

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      expect(result.status).toBe(200);
    });

    it('allows request with valid x-cron-secret header', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue([]);

      const req = makeRequest({ 'x-cron-secret': 'super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      expect(result.status).toBe(200);
    });
  });

  describe('recap generated for active members', () => {
    it('sends emails to active members with recaps', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(mockRecaps());
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      const body = await result.json();

      expect(body.sent).toBe(2);
      expect(body.failed).toBe(0);
      expect(body.total).toBe(2);
      expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(2);
    });

    it('passes correct member data to generateWeeklyRecaps', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(mockRecaps());
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      expect(generateWeeklyRecaps).toHaveBeenCalledWith(members, expect.any(Date));
    });

    it('builds recap summary and passes it to email sender', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const expectedSummary = buildWeeklyRecapEmailSummary(recaps[0].recapData);
      expect(sendWeeklyRecapEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          fullName: 'Alice Smith',
          recapSummary: expectedSummary,
        })
      );
    });

    it('falls back to email when fullName is missing', async () => {
      const members = mockMembers([{ id: 'user-1', email: 'alice@example.com', fullName: undefined, enrolledProgram: 'cdl' }]);
      const recaps = mockRecaps([mockRecaps()[0]]);
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      expect(sendWeeklyRecapEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          fullName: 'alice@example.com',
        })
      );
    });
  });

  describe('recap content', () => {
    it('includes member progress summary in email', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain('Applications logged: 3');
      expect(callArgs.recapSummary).toContain('Learning resources completed: 2');
      expect(callArgs.recapSummary).toContain('Pathway steps completed: 1');
      expect(callArgs.recapSummary).toContain('Distinct AI tools used: 1');
    });

    it('includes next steps (recommended actions) in email', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain('Build your resume with the Resume Rewriter');
      expect(callArgs.recapSummary).toContain('Practice interview questions');
    });

    it('includes job matches (new live jobs count) in email', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain(
        'New roles on the job board (aligned with your program): 5'
      );
    });

    it('includes readiness score when available', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain('Job readiness score: 72');
    });

    it('includes goal progress when available', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain('Goal progress');
      expect(callArgs.recapSummary).toContain('Complete CDL training — in_progress (3/5)');
    });

    it('includes upcoming counselor sessions when available', async () => {
      const members = mockMembers();
      const recaps = mockRecaps();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(recaps);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      await runWeeklyRecap(req);

      const callArgs = vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0];
      expect(callArgs.recapSummary).toContain('Upcoming mentor / counselor sessions');
      expect(callArgs.recapSummary).toContain('Mon, May 12, 2:00 PM CDT — Career planning');
    });
  });

  describe('failure handling', () => {
    it('increments failed count when member has no recap data', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      // Only return recap for user-1, not user-2
      vi.mocked(generateWeeklyRecaps).mockResolvedValue([mockRecaps()[0]]);
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      const body = await result.json();

      expect(body.sent).toBe(1);
      expect(body.failed).toBe(1);
      expect(body.total).toBe(2);
      expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(1);
    });

    it('increments failed count and captures error when email send throws', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(mockRecaps());
      vi.mocked(sendWeeklyRecapEmail)
        .mockResolvedValueOnce({ ok: true })
        .mockRejectedValueOnce(new Error('SMTP timeout'));

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      const body = await result.json();

      expect(body.sent).toBe(1);
      expect(body.failed).toBe(1);
      expect(body.total).toBe(2);
      expect(captureApiError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ route: 'cron/weekly-recap', extra: { userId: 'user-2' } })
      );
    });

    it('does not count a fixture skip as sent or failed and never stamps emailedAt', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockMembers([
        { id: 'fixture-user', email: 'fixture@example.com', fullName: 'Fixture User', enrolledProgram: 'tech' },
      ]));
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(mockRecaps([
        { userId: 'fixture-user', recapData: mockRecaps()[0].recapData, score: 72 },
      ]));
      vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({
        ok: false,
        skipped: true,
        error: 'fixture_recipient',
      });

      const body = await (await runWeeklyRecap(
        makeRequest({ authorization: 'Bearer super-secret-cron-key' }),
      )).json();

      expect(body).toEqual({
        sent: 0,
        failed: 0,
        skipped: 1,
        skipReason: 'fixture_recipient',
        total: 1,
      });
      expect(prisma.weeklyRecap.update).not.toHaveBeenCalled();
      expect(captureApiError).not.toHaveBeenCalled();
    });

    it('aborts remaining recipients on provider rate limit without Sentry noise', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue(mockRecaps());
      vi.mocked(sendWeeklyRecapEmail)
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          rateLimited: true,
          error: 'Too many requests. You can only make 10 requests per second.',
        });
      vi.mocked(prisma.weeklyRecap.update).mockResolvedValue({} as any);

      const body = await (await runWeeklyRecap(
        makeRequest({ authorization: 'Bearer super-secret-cron-key' }),
      )).json();

      expect(body).toEqual({
        sent: 1,
        failed: 0,
        skipped: 1,
        skipReason: 'provider_rate_limited',
        total: 2,
      });
      expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(2);
      expect(prisma.weeklyRecap.update).toHaveBeenCalledTimes(1);
      expect(captureApiError).not.toHaveBeenCalled();
    });

    it('retries a persisted recap after an actual failed delivery on the next run', async () => {
      const members = mockMembers([
        { id: 'user-1', email: 'alice@example.com', fullName: 'Alice Smith', enrolledProgram: 'cdl' },
      ]);
      const recaps = mockRecaps([mockRecaps()[0]]);
      let persistedRecap = false;
      let emailedAt: Date | null = null;

      vi.mocked(prisma.user.findMany).mockImplementation((async () =>
        (!persistedRecap || emailedAt === null ? members : []) as any
      ) as any);
      vi.mocked(generateWeeklyRecaps).mockImplementation(async () => {
        persistedRecap = true;
        return recaps;
      });
      vi.mocked(sendWeeklyRecapEmail)
        .mockResolvedValueOnce({ ok: false, error: 'provider rejected delivery' })
        .mockResolvedValueOnce({ ok: true });
      vi.mocked(prisma.weeklyRecap.update).mockImplementation((async ({ data }: any) => {
        emailedAt = data.emailedAt;
        return {} as any;
      }) as any);

      const request = () => makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const first = await (await runWeeklyRecap(request())).json();
      const second = await (await runWeeklyRecap(request())).json();

      expect(first).toEqual({ sent: 0, failed: 1, total: 1 });
      expect(second).toEqual({ sent: 1, failed: 0, total: 1 });
      expect(generateWeeklyRecaps).toHaveBeenCalledTimes(2);
      expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(2);
      expect(vi.mocked(sendWeeklyRecapEmail).mock.calls[0][0].idempotencyKey)
        .toBe(vi.mocked(sendWeeklyRecapEmail).mock.calls[1][0].idempotencyKey);
      expect(prisma.weeklyRecap.update).toHaveBeenCalledTimes(1);
      expect(emailedAt).toBeInstanceOf(Date);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          weeklyRecaps: {
            none: {
              weekStartDate: { gte: expect.any(Date) },
              emailedAt: { not: null },
            },
          },
        }),
      }));
    });

    it('uses one request deadline for generation, pacing, and truthful tail accounting', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-09-11T00:00:00.000Z'));
        const members = Array.from({ length: 500 }, (_, index) => ({
          id: `user-${index}`,
          email: `member-${index}@example.com`,
          fullName: `Member ${index}`,
          enrolledProgram: 'tech',
        }));
        const recapData = mockRecaps()[0].recapData;
        vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
        vi.mocked(generateWeeklyRecaps).mockImplementation(async (selectedMembers) => {
          vi.setSystemTime(new Date(Date.now() + 260_000));
          return selectedMembers.map((member) => ({ userId: member.id, recapData, score: 72 })) as any;
        });
        vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });
        vi.mocked(prisma.weeklyRecap.update).mockResolvedValue({} as any);

        const pendingResult = runWeeklyRecap(
          makeRequest({ authorization: 'Bearer super-secret-cron-key' }),
        );
        await vi.runAllTimersAsync();
        const body = await (await pendingResult).json();

        expect(body).toEqual({
          sent: 67,
          failed: 0,
          skipped: 433,
          total: 500,
          skipReason: 'request_deadline_exhausted',
        });
        expect(generateWeeklyRecaps).toHaveBeenCalledWith(members, expect.any(Date));
        expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(67);
        expect(prisma.weeklyRecap.update).toHaveBeenCalledTimes(67);
        const deadlines = vi.mocked(sendWeeklyRecapEmail).mock.calls.map(([params]) => params.deadlineAtMs);
        expect(new Set(deadlines)).toEqual(new Set([new Date('2026-09-11T00:00:00.000Z').getTime() + 270_000]));
        expect(body.sent + body.failed + body.skipped).toBe(body.total);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns empty result when no active members', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue([]);

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      const body = await result.json();

      expect(body).toEqual({ sent: 0, failed: 0, total: 0 });
      expect(sendWeeklyRecapEmail).not.toHaveBeenCalled();
    });

    it('logs error status when all members fail', async () => {
      const members = mockMembers();
      vi.mocked(prisma.user.findMany).mockResolvedValue(members);
      vi.mocked(generateWeeklyRecaps).mockResolvedValue([]);

      const req = makeRequest({ authorization: 'Bearer super-secret-cron-key' });
      const result = await runWeeklyRecap(req);
      const body = await result.json();

      expect(body.sent).toBe(0);
      expect(body.failed).toBe(2);
      expect(body.total).toBe(2);
      expect(sendWeeklyRecapEmail).not.toHaveBeenCalled();
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
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const result = authorizeCronRequest(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });
});
