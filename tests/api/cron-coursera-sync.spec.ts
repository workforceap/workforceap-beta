import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));
vi.mock('@/lib/cron/withCronLogging', () => ({ withCronLogging: (_key: string, handler: unknown) => handler }));
vi.mock('@/lib/admin/logCronRun', () => ({ logCronRun: vi.fn() }));
vi.mock('@/lib/cron/cronExecution', () => ({ setCronRecordsProcessed: vi.fn() }));
vi.mock('@/lib/cron/isCronEnabled', () => ({ isCronEnabled: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/coursera/syncMembers', () => ({ fetchEligibleCourseraMembers: vi.fn() }));
vi.mock('@/lib/coursera/config', () => ({
  resolveCourseraProgramId: vi.fn(),
  resolveCourseraSkillsetIds: vi.fn(),
}));
vi.mock('@/lib/coursera/client', () => ({ fetchCourseraLearnerSkillsetProgress: vi.fn() }));

const upsert = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: { courseraSkillsetProgress: { upsert: typeof upsert } }) => unknown) =>
      fn({ courseraSkillsetProgress: { upsert } }),
    ),
  },
}));

import { GET } from '@/app/api/cron/coursera-sync/route';
import { isCronEnabled } from '@/lib/cron/isCronEnabled';
import { logCronRun } from '@/lib/admin/logCronRun';
import { setCronRecordsProcessed } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';
import { fetchEligibleCourseraMembers } from '@/lib/coursera/syncMembers';
import { resolveCourseraProgramId, resolveCourseraSkillsetIds } from '@/lib/coursera/config';
import { fetchCourseraLearnerSkillsetProgress } from '@/lib/coursera/client';

const request = () => new Request('http://localhost/api/cron/coursera-sync');
const member = (id: string, enrolledProgram: string | null = 'it-support') => ({
  id,
  email: `${id}@example.org`,
  enrolledProgram,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCronEnabled).mockResolvedValue(true);
  vi.mocked(fetchEligibleCourseraMembers).mockResolvedValue([]);
  vi.mocked(resolveCourseraProgramId).mockImplementation((slug) =>
    slug === 'it-support' ? 'prog-it' : '',
  );
  vi.mocked(resolveCourseraSkillsetIds).mockImplementation((slug) =>
    slug === 'it-support' ? ['skillset-it'] : [],
  );
  vi.mocked(fetchCourseraLearnerSkillsetProgress).mockResolvedValue({
    learnerName: null,
    learnerEmail: null,
    learnerExternalUserId: null,
    elements: [],
    pagination: null,
  } as never);
});

describe('GET /api/cron/coursera-sync', () => {
  it('logs a disabled skip without polling members or Coursera', async () => {
    vi.mocked(isCronEnabled).mockResolvedValue(false);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, skipped: 'disabled', members: 0 });
    expect(logCronRun).toHaveBeenCalledExactlyOnceWith(
      'cron_coursera_sync',
      { skipped: true, reason: 'disabled' },
      'ok',
    );
    expect(fetchEligibleCourseraMembers).not.toHaveBeenCalled();
    expect(fetchCourseraLearnerSkillsetProgress).not.toHaveBeenCalled();
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
  });

  it('returns no_skillsets_configured when no enrolled program maps to skillsets', async () => {
    vi.mocked(fetchEligibleCourseraMembers).mockResolvedValue([member('learner-a', 'unknown-program')]);

    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      skipped: 'no_skillsets_configured',
      members: 0,
    });
    expect(fetchCourseraLearnerSkillsetProgress).not.toHaveBeenCalled();
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_coursera_sync',
      expect.objectContaining({ skipped: 'no_skillsets_configured', members: 0 }),
      'ok',
    );
    expect(setCronRecordsProcessed).not.toHaveBeenCalled();
  });

  it('records the run as error when every processed member fails, while JSON stays ok', async () => {
    vi.mocked(fetchEligibleCourseraMembers).mockResolvedValue([member('learner-a')]);
    vi.mocked(fetchCourseraLearnerSkillsetProgress).mockRejectedValue(new Error('Coursera unavailable'));

    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      processed: 1,
      errors: 1,
      skipped: 0,
      withProgress: 0,
    });
    expect(captureApiError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: 'cron/coursera-sync', extra: expect.objectContaining({ userId: 'learner-a' }) }),
    );
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_coursera_sync',
      expect.objectContaining({ ok: true, processed: 1, errors: 1 }),
      'error',
    );
    expect(setCronRecordsProcessed).toHaveBeenCalledWith(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('skips members without a program mapping and keeps a mixed run as ok', async () => {
    vi.mocked(fetchEligibleCourseraMembers).mockResolvedValue([
      member('ok-learner', 'it-support'),
      member('skipped-learner', 'unknown-program'),
    ]);
    vi.mocked(fetchCourseraLearnerSkillsetProgress).mockResolvedValue({
      learnerName: null,
      learnerEmail: null,
      learnerExternalUserId: null,
      elements: [
        { skillsetId: 'skillset-it', skillsetName: 'IT Support', progressPercent: 40 },
        { skillsetId: '', skillsetName: 'ignored', progressPercent: 90 },
      ],
      pagination: null,
    } as never);

    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      processed: 2,
      withProgress: 1,
      errors: 0,
      skipped: 1,
    });
    expect(fetchCourseraLearnerSkillsetProgress).toHaveBeenCalledExactlyOnceWith({
      programId: 'prog-it',
      externalUserId: 'ok-learner',
      email: 'ok-learner@example.org',
      skillsetIds: ['skillset-it'],
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(logCronRun).toHaveBeenCalledWith(
      'cron_coursera_sync',
      expect.objectContaining({ processed: 2, errors: 0, skipped: 1 }),
      'ok',
    );
  });
});
