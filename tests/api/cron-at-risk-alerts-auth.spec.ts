import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression guard for the at-risk alerts cron authorization path.
 *
 * `/api/cron/at-risk-alerts` carried its own `verifyCronSecret()` that read
 * only the `x-cron-secret` header. Vercel Cron authenticates with
 * `Authorization: Bearer $CRON_SECRET`, so every scheduled invocation cleared
 * the shared `withCronLogging` → `authorizeCronRequest` gate and was then
 * rejected 401 by that inner check. Production `cron_executions` recorded
 * `Cron handler returned HTTP 401` for 2026-08-31 and 2026-09-07, and no
 * counselor alerts or member retention nudges were delivered in between.
 *
 * These tests exercise the REAL `withCronLogging` and `authorizeCronRequest`
 * so they fail if a second, narrower auth check is reintroduced in the route.
 * Only the wrapper's storage/telemetry dependencies are mocked.
 */

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

// Wrapper dependencies: storage and telemetry only. `authorizeCronRequest`
// is deliberately NOT mocked — it is the behaviour under test.
vi.mock('@/lib/cron/cronExecution', () => ({
  startCronExecution: vi.fn(async () => 'exec-test-id'),
  completeCronExecution: vi.fn(async () => undefined),
  runWithCronExecution: vi.fn(async (_id: string, fn: () => Promise<unknown>) => fn()),
  setCronRecordsProcessed: vi.fn(async () => undefined),
  getCronRecordsProcessed: vi.fn(() => undefined),
  hasCronDiagnosticBeenLogged: vi.fn(() => false),
}));

vi.mock('@/lib/cron/isCronEnabled', () => ({
  isCronEnabled: vi.fn(async () => true),
}));

vi.mock('@/lib/db/gucContext', () => ({
  runWithGucContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
  SYSTEM_GUC_CONTEXT: { role: 'system' },
  getGucContext: () => null,
}));

vi.mock('@/lib/admin/logCronRun', () => ({
  logCronRun: vi.fn(async () => undefined),
}));

vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

// The work itself is out of scope here; these tests are about reachability.
// Counselor alerts moved to /api/cron/at-risk-check (WAP-30); this route must
// never call them again.
vi.mock('@/lib/cron/at-risk-alerts', () => ({
  runDailyAtRiskCounselorAlerts: vi.fn(async () => ({ counselorsNotified: 2 })),
  runMemberRetentionNudges: vi.fn(async () => ({
    sentCheckIn: 1,
    sentComeBack: 0,
    sentStuck: 0,
  })),
}));

import { GET, POST } from '@/app/api/cron/at-risk-alerts/route';
import {
  runDailyAtRiskCounselorAlerts,
  runMemberRetentionNudges,
} from '@/lib/cron/at-risk-alerts';
import { completeCronExecution } from '@/lib/cron/cronExecution';
import { captureApiError } from '@/lib/observability/captureApiError';

const CRON_SECRET = 'test-cron-secret';

function request(headers: Record<string, string> = {}, method = 'POST') {
  return new Request('http://localhost:3000/api/cron/at-risk-alerts', { method, headers });
}

describe('/api/cron/at-risk-alerts authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('accepts the Authorization Bearer form that Vercel Cron sends', async () => {
    const res = await POST(request({ authorization: `Bearer ${CRON_SECRET}` }));

    expect(res.status).toBe(200);
    expect(runDailyAtRiskCounselorAlerts).not.toHaveBeenCalled();
    expect(runMemberRetentionNudges).toHaveBeenCalledTimes(1);
    expect(completeCronExecution).toHaveBeenCalledWith('exec-test-id', 'SUCCESS');
  });

  it('accepts the Authorization Bearer form on GET as well', async () => {
    const res = await GET(request({ authorization: `Bearer ${CRON_SECRET}` }, 'GET'));

    expect(res.status).toBe(200);
    expect(runMemberRetentionNudges).toHaveBeenCalledTimes(1);
    expect(runDailyAtRiskCounselorAlerts).not.toHaveBeenCalled();
  });

  it('still accepts the x-cron-secret header form', async () => {
    const res = await POST(request({ 'x-cron-secret': CRON_SECRET }));

    expect(res.status).toBe(200);
    expect(runMemberRetentionNudges).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with no cron secret and runs no work', async () => {
    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(runDailyAtRiskCounselorAlerts).not.toHaveBeenCalled();
    expect(runMemberRetentionNudges).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret in either header form and runs no work', async () => {
    const bearer = await POST(request({ authorization: 'Bearer wrong-secret' }));
    const headerForm = await POST(request({ 'x-cron-secret': 'wrong-secret' }));

    expect(bearer.status).toBe(401);
    expect(headerForm.status).toBe(401);
    expect(runDailyAtRiskCounselorAlerts).not.toHaveBeenCalled();
    expect(runMemberRetentionNudges).not.toHaveBeenCalled();
  });

  it('records success for authorized work with no failed deliveries', async () => {
    await POST(request({ authorization: `Bearer ${CRON_SECRET}` }));

    const failedCalls = vi
      .mocked(completeCronExecution)
      .mock.calls.filter((call) => call[1] === 'FAILED');
    expect(failedCalls).toEqual([]);
  });

  it('records partial member nudge delivery failures as failed runs', async () => {
    vi.mocked(runMemberRetentionNudges).mockResolvedValueOnce({
      success: true,
      sentCheckIn: 1,
      sentComeBack: 0,
      sentStuck: 0,
      errors: 1,
    } as Awaited<ReturnType<typeof runMemberRetentionNudges>>);

    const res = await POST(request({ authorization: `Bearer ${CRON_SECRET}` }));

    expect(res.status).toBe(500);
    expect((await res.json()).memberNudges.sentCheckIn).toBe(1);
    expect(completeCronExecution).toHaveBeenCalledWith(
      'exec-test-id', 'FAILED', 'Cron handler returned HTTP 500',
    );
    expect(runDailyAtRiskCounselorAlerts).not.toHaveBeenCalled();
  });
});
