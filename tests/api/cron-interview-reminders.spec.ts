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
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    jobApplication: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendInterviewPrepReminderEmail: vi.fn(),
  sendInterviewDebriefPromptEmail: vi.fn(),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
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

import { GET } from '@/app/api/cron/interview-reminders/route';
import { prisma } from '@/lib/db/prisma';
import {
  sendInterviewPrepReminderEmail,
  sendInterviewDebriefPromptEmail,
} from '@/lib/email';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';

function makeRow(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    company: 'Acme',
    role: 'Engineer',
    nextInterviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    user: { email: `${id}@x.com`, fullName: `User ${id}` },
    ...overrides,
  };
}

describe('GET /api/cron/interview-reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends prep + debrief emails and stamps timestamps on success', async () => {
    (prisma.jobApplication.findMany as any)
      .mockResolvedValueOnce([makeRow('pre-1'), makeRow('pre-2')]) // pre
      .mockResolvedValueOnce([makeRow('post-1')]); // post
    (sendInterviewPrepReminderEmail as any).mockResolvedValue({ ok: true });
    (sendInterviewDebriefPromptEmail as any).mockResolvedValue({ ok: true });
    (prisma.jobApplication.update as any).mockResolvedValue({});

    const res = await GET(new Request('http://localhost/api/cron/interview-reminders') as any);
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.preSent).toBe(2);
    expect(json.postSent).toBe(1);
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(3);
    expect(prisma.jobApplication.update).toHaveBeenCalledTimes(3);
    const updates = (prisma.jobApplication.update as any).mock.calls.map(
      (c: any) => Object.keys(c[0].data)[0],
    );
    expect(updates).toContain('interviewPreReminderSentAt');
    expect(updates).toContain('interviewPostFollowUpSentAt');
  });

  it('does not stamp timestamp when email send fails', async () => {
    (prisma.jobApplication.findMany as any)
      .mockResolvedValueOnce([makeRow('pre-1')])
      .mockResolvedValueOnce([]);
    (sendInterviewPrepReminderEmail as any).mockResolvedValue({ ok: false });

    const res = await GET(new Request('http://localhost/api/cron/interview-reminders') as any);
    const json = await res.json();
    expect(json.preSent).toBe(0);
    expect(prisma.jobApplication.update).not.toHaveBeenCalled();
  });

  it('queries only for users with reminders enabled and not deleted', async () => {
    (prisma.jobApplication.findMany as any).mockResolvedValue([]);

    await GET(new Request('http://localhost/api/cron/interview-reminders') as any);
    const args = (prisma.jobApplication.findMany as any).mock.calls[0][0];
    expect(args.where.user.deletedAt).toBeNull();
    expect(args.where.user.notificationsReminders).toBe(true);
    expect(args.where.interviewPreReminderSentAt).toBeNull();
    expect(args.take).toBe(200);
  });

  it('returns 500 and captures error when prisma throws', async () => {
    (prisma.jobApplication.findMany as any).mockRejectedValue(new Error('db down'));

    const res = await GET(new Request('http://localhost/api/cron/interview-reminders') as any);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(captureApiError).toHaveBeenCalled();
  });
});
