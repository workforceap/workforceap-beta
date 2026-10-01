/**
 * WAP-167: weekly staff digest of pending applications by age, oldest first,
 * with the already-enrolled count that makes the queue honest.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { application: { findMany: vi.fn() } } }));
vi.mock('@/lib/email', () => ({
  getAdminAlertRecipients: vi.fn(() => ['ops@example.org', 'lead@example.org']),
  sendApplicantAgingDigestEmail: vi.fn(),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(), captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));

import { GET } from '@/app/api/cron/applicant-aging-digest/route';
import { prisma } from '@/lib/db/prisma';
import { sendApplicantAgingDigestEmail } from '@/lib/email';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { APPLICANT_AGE_BUCKETS, APPLICANT_AGING_SCAN_CAP, summarizeApplicationAging } from '@/lib/cron/applicantAging';
import { applicantAgingDigestHtml } from '@/emails/applicant-aging-digest';

const NOW = new Date('2026-09-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function app(id: string, ageDays: number, opts: { enrolled?: boolean; status?: string; name?: string; noSubmittedAt?: boolean } = {}) {
  const at = new Date(NOW.getTime() - ageDays * DAY);
  return {
    id,
    status: opts.status ?? 'PENDING',
    submittedAt: opts.noSubmittedAt ? null : at,
    createdAt: at,
    user: {
      id: `user-${id}`,
      fullName: opts.name ?? `Member ${id}`,
      email: `${id}@example.org`,
      courseEnrollments: opts.enrolled ? [{ id: `ce-${id}` }] : [],
    },
  };
}

const request = () => new Request('http://localhost/api/cron/applicant-aging-digest');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  vi.mocked(sendApplicantAgingDigestEmail).mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe('summarizeApplicationAging (pure)', () => {
  it('buckets by age, orders oldest first and counts already-enrolled applicants', () => {
    const summary = summarizeApplicationAging(
      [app('a', 2), app('b', 15, { enrolled: true }), app('c', 45), app('d', 120), app('e', 6), app('f', 90, { status: 'NEEDS_INFO' })],
      NOW,
    );
    expect(summary.total).toBe(6);
    expect(summary.buckets.map((b) => [b.key, b.count])).toEqual([
      ['under_7', 2],
      ['days_7_29', 1],
      ['days_30_89', 1],
      ['days_90_plus', 2],
    ]);
    expect(summary.oldest.map((r) => r.daysWaiting)).toEqual([120, 90, 45, 15, 6, 2]);
    expect(summary.oldest[0]).toMatchObject({ memberId: 'user-d', fullName: 'Member d', status: 'PENDING', alreadyEnrolled: false });
    expect(summary.oldest[1]).toMatchObject({ status: 'NEEDS_INFO' });
    expect(summary.enrolledButPending).toBe(1);
    expect(summary.oldestDays).toBe(120);
  });

  it('caps the named list and falls back to createdAt when submittedAt is missing', () => {
    const rows = Array.from({ length: 15 }, (_, i) => app(`r${i}`, i + 1));
    const summary = summarizeApplicationAging([...rows, app('legacy', 200, { noSubmittedAt: true })], NOW, { maxNamed: 10 });
    expect(summary.oldest).toHaveLength(10);
    expect(summary.oldest[0].daysWaiting).toBe(200);
    expect(summary.total).toBe(16);
  });

  it('buckets are contiguous from day 0 with an open top', () => {
    expect(APPLICANT_AGE_BUCKETS[0].minDays).toBe(0);
    for (let i = 1; i < APPLICANT_AGE_BUCKETS.length; i++) {
      expect(APPLICANT_AGE_BUCKETS[i].minDays).toBe(APPLICANT_AGE_BUCKETS[i - 1].maxDays + 1);
    }
    expect(APPLICANT_AGE_BUCKETS.at(-1)?.maxDays).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('GET /api/cron/applicant-aging-digest', () => {
  it('selects pending + needs-info applications of live members, bounded by the scan cap', async () => {
    vi.mocked(prisma.application.findMany).mockResolvedValue([]);
    await GET(request());
    expect(prisma.application.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { in: ['PENDING', 'NEEDS_INFO'] }, user: { deletedAt: null } },
      take: APPLICANT_AGING_SCAN_CAP,
    }));
  });

  it('sends one digest to the staff alert inboxes with bucket counts, oldest first and queue links', async () => {
    vi.mocked(prisma.application.findMany).mockResolvedValue([
      app('young', 3), app('mid', 20, { enrolled: true }), app('old', 100, { name: 'Grace Hopper' }),
    ] as never);
    const res = await GET(request());
    const body = await res.json();

    expect(sendApplicantAgingDigestEmail).toHaveBeenCalledTimes(1);
    const params = vi.mocked(sendApplicantAgingDigestEmail).mock.calls[0][0];
    expect(params.to).toEqual(['ops@example.org', 'lead@example.org']);
    expect(params.total).toBe(3);
    expect(params.enrolledButPending).toBe(1);
    expect(params.buckets.map((b) => b.count)).toEqual([1, 1, 0, 1]);
    expect(params.oldest[0]).toMatchObject({ memberId: 'user-old', fullName: 'Grace Hopper', daysWaiting: 100 });
    // The Applications workbench itself (WAP-190), a deep link sign-in keeps for every admin role.
    expect(params.queueLink).toMatch(/\/admin\/command-center\?queue=applications$/);
    expect(params.memberAdminBaseUrl).toMatch(/\/admin\/members$/);

    expect(body).toMatchObject({
      ok: true, scanned: 3, total: 3, oldestDays: 100, enrolledButPending: 1, recipients: 2, emailSent: true,
      buckets: { under_7: 1, days_7_29: 1, days_30_89: 0, days_90_plus: 1 },
    });
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(3);
  });

  it('sends nothing when the queue is empty', async () => {
    vi.mocked(prisma.application.findMany).mockResolvedValue([]);
    const body = await (await GET(request())).json();
    expect(sendApplicantAgingDigestEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ total: 0, emailSent: false, recipients: 0 });
  });

  it('reports a refused send instead of claiming delivery', async () => {
    vi.mocked(prisma.application.findMany).mockResolvedValue([app('one', 40)] as never);
    vi.mocked(sendApplicantAgingDigestEmail).mockResolvedValue({ ok: false, error: 'Send failed' });
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ emailSent: false, emailSkipped: 'send_failed' });
  });
});

describe('applicantAgingDigestHtml', () => {
  const params = {
    total: 3,
    buckets: [
      { key: 'under_7', label: 'Under 7 days', count: 1 },
      { key: 'days_90_plus', label: '90 days or more', count: 2 },
    ],
    oldest: [
      { memberId: 'm-1', fullName: 'Grace Hopper', email: 'g@example.org', daysWaiting: 120, status: 'PENDING', alreadyEnrolled: false },
      { memberId: 'm-2', fullName: null, email: 'anon@example.org', daysWaiting: 95, status: 'NEEDS_INFO', alreadyEnrolled: true },
    ],
    enrolledButPending: 1,
    queueLink: 'https://www.workforceap.org/admin/command-center?queue=applications',
    memberAdminBaseUrl: 'https://www.workforceap.org/admin/members',
  };

  it('shows counts per bucket, the oldest first with member links, and the queue link', () => {
    const html = applicantAgingDigestHtml(params);
    expect(html).toContain('3 applications are waiting');
    expect(html).toContain('Under 7 days');
    expect(html).toContain('90 days or more');
    expect(html.indexOf('Grace Hopper')).toBeLessThan(html.indexOf('anon@example.org'));
    expect(html).toContain('https://www.workforceap.org/admin/members/m-1');
    expect(html).toContain('120 days waiting');
    expect(html).toContain('needs info');
    expect(html).toContain('(already enrolled)');
    expect(html).toContain('1 of these applicants has already enrolled');
    expect(html).toContain('href="https://www.workforceap.org/admin/command-center?queue=applications"');
  });

  it('omits the enrolled note when nobody is double-counted and escapes names', () => {
    const html = applicantAgingDigestHtml({
      ...params,
      enrolledButPending: 0,
      oldest: [{ ...params.oldest[0], fullName: '<script>x</script>' }],
    });
    expect(html).not.toContain('already enrolled');
    expect(html).not.toContain('<script>x</script>');
  });
});
