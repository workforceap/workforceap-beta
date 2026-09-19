import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/lib/recap/buildWeeklyRecapEmailSummary', () => ({
  buildWeeklyRecapEmailSummary: vi.fn().mockReturnValue('Recap summary text'),
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
  withCronLogging: vi.fn((_key, handler) => handler),
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as weeklyRecapGET } from '@/app/api/cron/weekly-recap/route';
import { prisma } from '@/lib/db/prisma';
import { sendWeeklyRecapEmail } from '@/lib/email';
import { generateWeeklyRecaps } from '@/lib/recap/generate';
import { captureApiError } from '@/lib/observability/captureApiError';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';

describe('GET /api/cron/weekly-recap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends recaps to members without one this week', async () => {
    const members = [
      { id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' },
      { id: 'user-2', email: 'b@example.com', fullName: 'Bob', enrolledProgram: null },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([
      { userId: 'user-1', recapData: { coursesCompleted: 2 } },
      { userId: 'user-2', recapData: { coursesCompleted: 0 } },
    ] as any);
    vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

    const res = await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(2);
    expect(json.failed).toBe(0);
    expect(json.total).toBe(2);
    expect(sendWeeklyRecapEmail).toHaveBeenCalledTimes(2);
  });

  it('skips members when recap generation returns nothing', async () => {
    const members = [{ id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([] as any);

    const res = await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.failed).toBe(1);
  });

  it('counts failures when email send throws', async () => {
    const members = [
      { id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' },
    ];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([
      { userId: 'user-1', recapData: { coursesCompleted: 1 } },
    ] as any);
    vi.mocked(sendWeeklyRecapEmail).mockRejectedValue(new Error('SMTP error'));

    const res = await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.failed).toBe(1);
    expect(captureApiError).toHaveBeenCalled();
  });

  it('limits to 500 members', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([] as any);

    await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 })
    );
  });

  it('sets cron records processed to sent count', async () => {
    const members = [{ id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([
      { userId: 'user-1', recapData: { coursesCompleted: 1 } },
    ] as any);
    vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

    await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(1);
  });

  it('logs cron run with ok status on success', async () => {
    const members = [{ id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([
      { userId: 'user-1', recapData: { coursesCompleted: 1 } },
    ] as any);
    vi.mocked(sendWeeklyRecapEmail).mockResolvedValue({ ok: true });

    await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_weekly_recap',
      expect.objectContaining({ sent: 1, failed: 0, total: 1 }),
      'ok'
    );
  });

  it('logs cron run with error when all sends fail', async () => {
    const members = [{ id: 'user-1', email: 'a@example.com', fullName: 'Alice', enrolledProgram: 'cyber' }];
    vi.mocked(prisma.user.findMany).mockResolvedValue(members as any);
    vi.mocked(generateWeeklyRecaps).mockResolvedValue([
      { userId: 'user-1', recapData: { coursesCompleted: 1 } },
    ] as any);
    vi.mocked(sendWeeklyRecapEmail).mockRejectedValue(new Error('SMTP error'));

    await weeklyRecapGET(new Request('http://localhost:3000/api/cron/weekly-recap'));
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_weekly_recap',
      expect.any(Object),
      'error'
    );
  });
});
