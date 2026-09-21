/**
 * WAP-166 item 2: the weekly onboarding-stalls digest names the oldest WIOA
 * screening still awaiting review, measured from the member's submission,
 * so the queue's age reaches staff without anyone opening the admin page.
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
    user: { findMany: vi.fn() },
    counselorAssignment: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email', () => ({ sendOnboardingStallsDigestEmail: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ isFixtureEmailRecipient: vi.fn(() => false) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));

import { GET } from '@/app/api/cron/onboarding-stalls/route';
import { prisma } from '@/lib/db/prisma';
import { sendOnboardingStallsDigestEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications/create';
import { onboardingStallsDigestHtml, oldestPendingLine } from '@/emails/onboarding-stalls-digest';
import { WIOA_QUEUE_AGE_ALERT_DAYS } from '@/lib/wioa/wioaQueueAge';

const NOW = new Date('2026-09-21T15:30:00Z');
const DAY = 24 * 60 * 60 * 1000;

function snapshot(ageDays: number) {
  return {
    version: 2,
    submittedAt: new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    signal: 'review',
    reasons: [],
    answers: {
      ageBracket: '25_54',
      countyOrZip: '78701',
      primaryBarrier: 'none',
      dislocatedWorker: false,
      lowIncomeSelfReport: true,
      trainingInterest: true,
      completedIntakeSelfReport: false,
    },
  };
}

type UserFindManyArgs = { where?: { wioaReviewStatus?: unknown; updatedAt?: unknown; interviewEligible?: unknown; enrolledProgram?: unknown; id?: unknown } };

/** Route the four `user.findMany` calls by their where-clause shape. */
function installUsers(opts: { stalled: Array<{ id: string }>; awaiting: Array<{ wioaQualificationJson: unknown; updatedAt: Date }>; admins?: Array<{ id: string; email: string }> }) {
  vi.mocked(prisma.user.findMany).mockImplementation((async (args?: unknown) => {
    const where = (args as UserFindManyArgs | undefined)?.where ?? {};
    if ('interviewEligible' in where) return [];
    if ('enrolledProgram' in where) return [];
    if ('wioaReviewStatus' in where && 'updatedAt' in where) {
      return opts.stalled.map((m) => ({ id: m.id, fullName: `Member ${m.id}`, email: `${m.id}@example.org`, updatedAt: new Date(NOW.getTime() - 6 * DAY) }));
    }
    if ('wioaReviewStatus' in where) return opts.awaiting;
    if ('id' in where) return opts.admins ?? [{ id: 'admin-1', email: 'ops@example.org' }];
    return [];
  }) as never);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.mocked(sendOnboardingStallsDigestEmail).mockResolvedValue({ ok: true });
  vi.mocked(prisma.counselorAssignment.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.profile.findMany).mockResolvedValue([{ userId: 'admin-1' }] as never);
  vi.mocked(prisma.userRole.findMany).mockResolvedValue([] as never);
});
afterEach(() => vi.useRealTimers());

describe('onboarding-stalls digest: oldest pending WIOA screening', () => {
  it('reports the oldest wait from submittedAt across every pending row and flags it as overdue', async () => {
    installUsers({
      stalled: [{ id: 'm1' }],
      awaiting: [
        { wioaQualificationJson: snapshot(117), updatedAt: new Date(NOW) }, // profile edited today; still waiting 117 days
        { wioaQualificationJson: snapshot(125), updatedAt: new Date(NOW.getTime() - 6 * DAY) },
        { wioaQualificationJson: snapshot(2), updatedAt: new Date(NOW.getTime() - 6 * DAY) },
      ],
    });

    const response = await GET(new Request('http://localhost/api/cron/onboarding-stalls'));
    const body = await response.json();

    expect(body.wioaOldestPendingDays).toBe(125);
    expect(body.wioaQueueOverdue).toBe(true);
    expect(vi.mocked(sendOnboardingStallsDigestEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendOnboardingStallsDigestEmail).mock.calls[0][0]).toMatchObject({ wioaOldestPendingDays: 125, wioaCount: 1 });
    expect(vi.mocked(createNotification).mock.calls[0][0]).toMatchObject({
      body: expect.stringContaining(`Oldest pending WIOA screening: 125 days (over the ${WIOA_QUEUE_AGE_ALERT_DAYS}-day threshold).`),
      data: expect.objectContaining({ wioaOldestPendingDays: 125 }),
    });
  });

  it('reports null and no overdue flag when nothing is awaiting review', async () => {
    installUsers({ stalled: [], awaiting: [] });

    const body = await (await GET(new Request('http://localhost/api/cron/onboarding-stalls'))).json();

    expect(body.totalStalled).toBe(0);
    expect(body.wioaOldestPendingDays).toBeNull();
    expect(body.wioaQueueOverdue).toBe(false);
    expect(sendOnboardingStallsDigestEmail).not.toHaveBeenCalled();
  });
});

describe('digest email body', () => {
  const base = {
    interviewCount: 0,
    wioaCount: 1,
    noProgramCount: 0,
    interviewMembers: [],
    wioaMembers: [{ id: 'm1', fullName: 'Ada Lovelace', email: 'ada@example.org' }],
    noProgramMembers: [],
    interviewQueueLink: 'https://example.org/admin/members/interview-ready',
    wioaQueueLink: 'https://example.org/admin/wioa-screening',
    membersQueueLink: 'https://example.org/admin/members',
    memberAdminBaseUrl: 'https://example.org/admin/members',
  };

  it('carries the oldest-pending line inside the WIOA section', () => {
    const html = onboardingStallsDigestHtml({ ...base, wioaOldestPendingDays: 117 });
    expect(html).toContain('Oldest pending WIOA screening: 117 days');
    expect(html).toContain(`over the ${WIOA_QUEUE_AGE_ALERT_DAYS}-day threshold`);
    expect(html.indexOf('Oldest pending WIOA screening')).toBeLessThan(html.indexOf('Open WIOA screening queue'));
  });

  it('omits the line when no screening is waiting and singularises one day', () => {
    expect(onboardingStallsDigestHtml(base)).not.toContain('Oldest pending WIOA screening');
    expect(oldestPendingLine(null)).toBe('');
    expect(oldestPendingLine(1)).toContain('1 day<');
    expect(oldestPendingLine(3)).not.toContain('threshold');
  });
});
