/**
 * WAP-167: applicants are chased at day 3, day 10 and day 20, once per
 * application per stage, and never past the day-20 window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    application: { findMany: vi.fn() },
    memberEvent: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/email', () => ({
  sendApplicantFollowupEmail: vi.fn(),
  sendApplicantChaseEmail: vi.fn(),
  sendAdminPendingApplicantsEmail: vi.fn(),
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: () => ({
    run: (fn: () => Promise<unknown>) => fn(),
    summary: () => ({ admitted: 0, skipped: 0 }),
  }),
}));

import { GET } from '@/app/api/cron/applicant-followup/route';
import { prisma } from '@/lib/db/prisma';
import { sendAdminPendingApplicantsEmail, sendApplicantChaseEmail, sendApplicantFollowupEmail } from '@/lib/email';
import { trackEvent } from '@/lib/events/track';
import { captureApiError } from '@/lib/observability/captureApiError';
import {
  APPLICANT_CHASE_STAGES,
  chaseLedgerFromEvents,
  chaseLedgerKey,
  chaseWindow,
  stageForAgeDays,
} from '@/lib/cron/applicantChase';
import { applicantChaseHtml } from '@/emails/applicant-chase';

const NOW = new Date('2026-09-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

type Fixture = { id: string; userId: string; ageDays: number; email?: string; name?: string };

function fixture(rows: Fixture[]) {
  const apps = rows.map((row) => ({
    id: row.id,
    status: 'PENDING',
    submittedAt: new Date(NOW.getTime() - row.ageDays * DAY),
    createdAt: new Date(NOW.getTime() - row.ageDays * DAY),
    user: { id: row.userId, email: row.email ?? `${row.userId}@example.org`, fullName: row.name ?? 'Ada Lovelace' },
  }));
  // Real window semantics: only rows whose submittedAt falls inside the
  // queried gte/lte bounds come back, so the spec exercises the schedule.
  vi.mocked(prisma.application.findMany).mockImplementation((async (args: { where: { submittedAt: { gte: Date; lte: Date } } }) => {
    const { gte, lte } = args.where.submittedAt;
    return apps.filter((app) => app.submittedAt >= gte && app.submittedAt <= lte);
  }) as never);
  return apps;
}

const request = () => new Request('http://localhost/api/cron/applicant-followup');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([]);
  vi.mocked(sendApplicantFollowupEmail).mockResolvedValue({ ok: true });
  vi.mocked(sendApplicantChaseEmail).mockResolvedValue({ ok: true });
  vi.mocked(sendAdminPendingApplicantsEmail).mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe('chase schedule (pure)', () => {
  it('defines three closed windows: 3–6, 10–13 and 20–23 days', () => {
    expect(APPLICANT_CHASE_STAGES.map((s) => [s.stage, s.minDays, s.maxDays])).toEqual([
      ['day3', 3, 6],
      ['day10', 10, 13],
      ['day20', 20, 23],
    ]);
    const window = chaseWindow(APPLICANT_CHASE_STAGES[1], NOW);
    expect(window.gte.toISOString()).toBe('2026-09-07T12:00:00.000Z');
    expect(window.lte.toISOString()).toBe('2026-09-10T12:00:00.000Z');
  });

  it('maps ages to stages and leaves the gaps and the tail unchased', () => {
    expect(stageForAgeDays(2)).toBeNull();
    expect(stageForAgeDays(3)).toBe('day3');
    expect(stageForAgeDays(6)).toBe('day3');
    expect(stageForAgeDays(7)).toBeNull();
    expect(stageForAgeDays(10)).toBe('day10');
    expect(stageForAgeDays(13)).toBe('day10');
    expect(stageForAgeDays(20)).toBe('day20');
    expect(stageForAgeDays(23)).toBe('day20');
    expect(stageForAgeDays(24)).toBeNull();
    expect(stageForAgeDays(115)).toBeNull();
  });

  it('reads the ledger from stored events, defaulting stage-less rows to day3', () => {
    const ledger = chaseLedgerFromEvents([
      { entityId: 'app-a', metadata: { stage: 'day10' } },
      { entityId: 'app-b', metadata: null },
      { entityId: null, metadata: { stage: 'day20' } },
    ]);
    expect(ledger.has(chaseLedgerKey('app-a', 'day10'))).toBe(true);
    expect(ledger.has(chaseLedgerKey('app-a', 'day3'))).toBe(false);
    expect(ledger.has(chaseLedgerKey('app-b', 'day3'))).toBe(true);
    expect(ledger.size).toBe(2);
  });
});

describe('GET /api/cron/applicant-followup', () => {
  it('queries one closed window per stage', async () => {
    fixture([]);
    await GET(request());
    const windows = vi.mocked(prisma.application.findMany).mock.calls.map(
      ([args]) => (args as { where: { submittedAt: { gte: Date; lte: Date } } }).where.submittedAt,
    );
    expect(windows).toEqual([
      { gte: new Date(NOW.getTime() - 6 * DAY), lte: new Date(NOW.getTime() - 3 * DAY) },
      { gte: new Date(NOW.getTime() - 13 * DAY), lte: new Date(NOW.getTime() - 10 * DAY) },
      { gte: new Date(NOW.getTime() - 23 * DAY), lte: new Date(NOW.getTime() - 20 * DAY) },
    ]);
    for (const [args] of vi.mocked(prisma.application.findMany).mock.calls) {
      expect((args as { where: { status: string } }).where.status).toBe('PENDING');
    }
  });

  it('routes each application to the stage its age falls in and ignores the tail', async () => {
    fixture([
      { id: 'fresh', userId: 'u-fresh', ageDays: 1 },
      { id: 'd3', userId: 'u-d3', ageDays: 4, email: 'ada@example.org', name: 'Ada Lovelace' },
      { id: 'd10', userId: 'u-d10', ageDays: 11 },
      { id: 'd20', userId: 'u-d20', ageDays: 22 },
      { id: 'old', userId: 'u-old', ageDays: 40 },
      { id: 'ancient', userId: 'u-ancient', ageDays: 115 },
    ]);
    const res = await GET(request());
    const body = await res.json();

    expect(sendApplicantFollowupEmail).toHaveBeenCalledExactlyOnceWith({ to: 'ada@example.org', fullName: 'Ada Lovelace' });
    expect(sendApplicantChaseEmail).toHaveBeenCalledTimes(2);
    expect(sendApplicantChaseEmail).toHaveBeenCalledWith({ to: 'u-d10@example.org', fullName: 'Ada Lovelace', stage: 'day10' });
    expect(sendApplicantChaseEmail).toHaveBeenCalledWith({ to: 'u-d20@example.org', fullName: 'Ada Lovelace', stage: 'day20' });
    const recipients = [
      ...vi.mocked(sendApplicantFollowupEmail).mock.calls.map(([p]) => p.to),
      ...vi.mocked(sendApplicantChaseEmail).mock.calls.map(([p]) => p.to),
    ];
    expect(recipients).not.toContain('u-fresh@example.org');
    expect(recipients).not.toContain('u-old@example.org');
    expect(recipients).not.toContain('u-ancient@example.org');

    expect(body.applicantEmailsSent).toBe(3);
    expect(body.stages).toMatchObject({
      day3: { matched: 1, sent: 1 },
      day10: { matched: 1, sent: 1 },
      day20: { matched: 1, sent: 1 },
    });
    expect(body.ledgerAvailable).toBe(true);
    // Staff alert still reports the fresh 3–6 day queue.
    expect(sendAdminPendingApplicantsEmail).toHaveBeenCalledExactlyOnceWith({ pendingCount: 1 });
  });

  it('records one application_reminder_sent event per successful send, tagged with the stage', async () => {
    fixture([
      { id: 'd3', userId: 'u-d3', ageDays: 4 },
      { id: 'd20', userId: 'u-d20', ageDays: 21 },
    ]);
    await GET(request());
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenCalledWith({
      userId: 'u-d3', eventName: 'application_reminder_sent', entityType: 'application', entityId: 'd3', metadata: { stage: 'day3' },
    });
    expect(trackEvent).toHaveBeenCalledWith({
      userId: 'u-d20', eventName: 'application_reminder_sent', entityType: 'application', entityId: 'd20', metadata: { stage: 'day20' },
    });
    expect(prisma.memberEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventName: { in: expect.arrayContaining(['application_reminder_sent', 'APPLICATION_REMINDER_SENT']) },
        entityType: 'application',
        entityId: { in: ['d3', 'd20'] },
      }),
    }));
  });

  it('is idempotent per application per stage: a stage already in the ledger is skipped, a new stage is not', async () => {
    fixture([
      { id: 'again', userId: 'u-again', ageDays: 12 },
      { id: 'later', userId: 'u-later', ageDays: 21 },
    ]);
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([
      { entityId: 'again', metadata: { stage: 'day10' } },
      // Day-3 send for the same application must not block its day-20 chase.
      { entityId: 'later', metadata: { stage: 'day3' } },
    ] as never);
    const body = await (await GET(request())).json();
    expect(sendApplicantChaseEmail).toHaveBeenCalledExactlyOnceWith({ to: 'u-later@example.org', fullName: 'Ada Lovelace', stage: 'day20' });
    expect(body.stages.day10).toMatchObject({ matched: 1, sent: 0, skippedAlreadySent: 1 });
    expect(body.stages.day20).toMatchObject({ matched: 1, sent: 1, skippedAlreadySent: 0 });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('sends at most one email per applicant per run, earliest stage first', async () => {
    fixture([
      { id: 'a-new', userId: 'u-two', ageDays: 4 },
      { id: 'a-old', userId: 'u-two', ageDays: 11 },
    ]);
    const body = await (await GET(request())).json();
    expect(sendApplicantFollowupEmail).toHaveBeenCalledTimes(1);
    expect(sendApplicantChaseEmail).not.toHaveBeenCalled();
    expect(body.uniqueApplicants).toBe(1);
    expect(body.stages.day10.skippedSeen).toBe(1);
  });

  it('does not write the ledger for a send the provider refused', async () => {
    fixture([{ id: 'd10', userId: 'u-d10', ageDays: 11 }]);
    vi.mocked(sendApplicantChaseEmail).mockResolvedValue({ ok: false, error: 'Send failed' });
    const body = await (await GET(request())).json();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(body.applicantEmailsSent).toBe(0);
    expect(body.stages.day10).toMatchObject({ sent: 0, failed: 1 });
  });

  it('keeps chasing on the window bound alone when the ledger cannot be read, and reports it', async () => {
    fixture([{ id: 'd20', userId: 'u-d20', ageDays: 22 }]);
    vi.mocked(prisma.memberEvent.findMany).mockRejectedValue(new Error('db down'));
    const body = await (await GET(request())).json();
    expect(sendApplicantChaseEmail).toHaveBeenCalledTimes(1);
    expect(body.ledgerAvailable).toBe(false);
    expect(captureApiError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ extra: { phase: 'chase_ledger' } }));
  });
});

describe('applicantChaseHtml', () => {
  const dashboardUrl = 'https://www.workforceap.org/dashboard';

  it('never promises a review date and never uses eligibility language', () => {
    for (const stage of ['day10', 'day20'] as const) {
      const html = applicantChaseHtml({ firstName: 'Taylor', stage, dashboardUrl });
      expect(html).toContain('Hi Taylor,');
      expect(html).not.toMatch(/we expect to have an update/i);
      expect(html).not.toMatch(/business days/i);
      expect(html).not.toMatch(/eligib/i);
      expect(html).not.toMatch(/undefined/);
      expect(html).toContain(dashboardUrl);
    }
  });

  it('escalates honestly between the two later stages', () => {
    const day10 = applicantChaseHtml({ firstName: 'Taylor', stage: 'day10', dashboardUrl });
    const day20 = applicantChaseHtml({ firstName: 'Taylor', stage: 'day20', dashboardUrl });
    expect(day10).toMatch(/still in our review queue/);
    expect(day10).toMatch(/Choose the career program/);
    expect(day20).toMatch(/haven't forgotten you/);
    expect(day20).toMatch(/reply and let us know/);
    expect(day10).not.toBe(day20);
  });

  it('escapes the first name', () => {
    expect(applicantChaseHtml({ firstName: '<b>x</b>', stage: 'day10', dashboardUrl })).not.toContain('<b>x</b>');
  });
});
