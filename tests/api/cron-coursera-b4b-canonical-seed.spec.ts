// @vitest-environment node
/**
 * coursera-b4b-sync's canonical mapping refresh is best-effort. A B4B
 * directory or seed throw must not fail the enrollment-report cron; a
 * thrown enrollment sync still answers 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sync: vi.fn(),
  loadContents: vi.fn(),
  seed: vi.fn(),
  logCronRun: vi.fn(),
  setCronRecordsProcessed: vi.fn(),
  captureApiError: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/coursera/b4bSync', () => ({
  syncCourseraB4BEnrollmentReports: h.sync,
}));

vi.mock('@/lib/coursera/programContentsCache', () => ({
  loadB4BContents: h.loadContents,
}));

vi.mock('@/lib/coursera/seedCanonicalMappingsFromB4B', () => ({
  seedCanonicalMappingsFromB4B: h.seed,
}));

vi.mock('@/lib/cron/withCronLogging', () => ({
  withCronLogging: (_key: string, handle: unknown) => handle,
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: h.logCronRun,
}));

vi.mock('@/lib/cron/cronExecution', () => ({
  setCronRecordsProcessed: h.setCronRecordsProcessed,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET } = await import('@/app/api/cron/coursera-b4b-sync/route');

const syncOk = {
  scanned: 2,
  upserted: 2,
  upsertedKnown: 1,
  upsertedUnknown: 0,
  upsertedUnmatched: 1,
  learningPathRows: 0,
  skippedNoEmail: 0,
  errors: 0,
  nextStart: 0,
  capped: false,
  continuationScope: { providerOrgId: 'provider-1', organizationId: 'tenant-1' },
  byUser: { 'user-1': 2 },
};

function run() {
  return GET(new Request('http://localhost:3000/api/cron/coursera-b4b-sync') as never);
}

describe('GET /api/cron/coursera-b4b-sync canonical seed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sync.mockResolvedValue(syncOk);
    h.loadContents.mockResolvedValue([{ contentId: 'course-1' }]);
    h.seed.mockResolvedValue({
      coursesMatched: 1,
      coursesUnmatched: 0,
      totalCreated: 1,
      totalUpdated: 0,
      totalConflicts: 0,
    });
  });

  it('keeps ok:true when canonical seed throws and records the seed error', async () => {
    const failure = new Error('b4b directory down');
    h.seed.mockRejectedValue(failure);
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.upserted).toBe(2);
    expect(body.canonicalSeed).toEqual({ error: 'b4b directory down' });
    expect(h.captureApiError).toHaveBeenCalledWith(failure, {
      route: 'cron/coursera-b4b-sync',
      extra: { step: 'canonical-seed' },
    });
    expect(h.setCronRecordsProcessed).toHaveBeenCalledWith(2);
    expect(h.logCronRun).toHaveBeenCalledWith('cron_coursera_b4b_sync', expect.objectContaining({ ok: true }), 'ok');
  });

  it('includes canonical seed counts on a successful refresh', async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      canonicalSeed: {
        matched: 1,
        unmatched: 0,
        created: 1,
        updated: 0,
        conflicts: 0,
      },
    });
    expect(h.seed).toHaveBeenCalledWith({ contents: [{ contentId: 'course-1' }], actorUserId: null });
  });

  it('answers 500 when enrollment-report sync throws', async () => {
    const failure = new Error('enrollment report failed');
    h.sync.mockRejectedValue(failure);
    const res = await run();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Cron failed' });
    expect(h.seed).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalledWith(failure, { route: 'cron/coursera-b4b-sync' });
    expect(h.logCronRun).toHaveBeenCalledWith(
      'cron_coursera_b4b_sync',
      { error: 'enrollment report failed' },
      'error',
    );
  });
});
