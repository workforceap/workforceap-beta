/**
 * Applicant Day-3 follow-up: no more "We expect to have an update for you
 * by <date>" promise. Ops cannot meet a five-business-day turnaround
 * (40-day median as of June 2026), so the email only commits to what we
 * do: email once a counselor has reviewed the application.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  prisma: { application: { findMany: vi.fn() } },
}));
vi.mock('@/lib/email', () => ({
  sendApplicantFollowupEmail: vi.fn(() => Promise.resolve({ ok: true })),
  sendAdminPendingApplicantsEmail: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email/pacing', () => ({
  createBulkEmailCronPacer: () => ({
    run: (fn: () => Promise<unknown>) => fn(),
    summary: () => ({ admitted: 1, skipped: 0 }),
  }),
}));

import { applicantFollowupHtml } from '@/emails/applicant-followup';
import { GET as runFollowupCron } from '@/app/api/cron/applicant-followup/route';
import { sendApplicantFollowupEmail } from '@/lib/email';
import { prisma } from '@/lib/db/prisma';

describe('applicantFollowupHtml', () => {
  it('no longer promises an update by a specific date', () => {
    const html = applicantFollowupHtml({ firstName: 'Taylor' });
    expect(html).toContain('Hi Taylor,');
    expect(html).not.toMatch(/we expect to have an update/i);
    expect(html).not.toMatch(/by <strong>/i);
    expect(html).not.toMatch(/undefined/);
    expect(html).toContain("We'll email you as soon as a counselor has reviewed your application.");
  });

  it('does not use eligibility language', () => {
    expect(applicantFollowupHtml({ firstName: 'Taylor' })).not.toMatch(/eligib/i);
  });
});

describe('GET /api/cron/applicant-followup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.application.findMany).mockResolvedValue([
      {
        id: 'app-1',
        status: 'PENDING',
        submittedAt: new Date('2026-09-15T12:00:00Z'),
        createdAt: new Date('2026-09-15T12:00:00Z'),
        user: { id: 'user-1', email: 'applicant@example.test', fullName: 'Ada Lovelace' },
      },
    ] as never);
  });

  it('sends the follow-up without computing or promising an expected date', async () => {
    const res = await runFollowupCron(new Request('http://localhost/api/cron/applicant-followup'));
    expect(res.status).toBe(200);
    expect(sendApplicantFollowupEmail).toHaveBeenCalledTimes(1);
    // Strict shape: on the old code this carried `expectedDate`.
    expect(sendApplicantFollowupEmail).toHaveBeenCalledWith({
      to: 'applicant@example.test',
      fullName: 'Ada Lovelace',
    });
    const body = await res.json();
    expect(body.applicantEmailsSent).toBe(1);
  });
});
