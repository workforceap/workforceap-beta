// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/admin/metrics when `coursera_xapi_events` is absent (db:push
 * environments): `summary.unmatchedCoursera` is computed without the xAPI
 * branch and is therefore narrower than production's, not wrong. The payload
 * says so through an additive `degraded` list; every existing field keeps its
 * shape and value, and with the table present the list is empty and nothing
 * beyond the probe itself is queried.
 *
 * The real route, progressQueries and notice module run; the database
 * client, auth, the aggregate metrics loader and Next's cache/response
 * wrappers are swapped.
 */

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: (req: Request) => Promise<Response>) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin-1' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-1' }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => false }));
vi.mock('@/lib/admin/metrics', () => ({
  getAdminMetrics: async () => ({
    totalMembers: 40,
    placementStats: { enrolled: 12, placed: 3, placementRate: 25 },
    aiToolRuns: 7,
    applicationsSubmitted: 5,
  }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: db.$queryRaw } }));

const PROBE = /to_regclass\('public\.coursera_xapi_events'\)/;
const isProbe = (call: unknown[]) => PROBE.test((call[0] as TemplateStringsArray).join(''));
const probeCalls = () => db.$queryRaw.mock.calls.filter(isProbe);
const otherCalls = () => db.$queryRaw.mock.calls.filter((call) => !isProbe(call));

/** The probe answers `present`; the unmatched COUNT returns 9; every other read is a zero count row. */
function mockDatabase(present: boolean, dashboard = { viewers: 0, activated: 0 }): void {
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join('');
    if (PROBE.test(sql)) return [{ present }];
    if (/COUNT\(DISTINCT email\)/.test(sql)) return [{ count: BigInt(9) }];
    if (/FILTER \(WHERE me\.event_name = 'member_dashboard_viewed'\)/.test(sql)) return [dashboard];
    if (/AVG\(/.test(sql)) return [{ avg: null }];
    if (/DATE_TRUNC/.test(sql)) return [];
    return [{ count: 0 }];
  });
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  db.$queryRaw.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
});

type Payload = {
  summary: Record<string, unknown>;
  funnels: unknown[];
  trends: Record<string, unknown>;
  degraded: string[];
};

/** Fresh module graph per request so the once-per-process "table present" memo starts clean. */
async function getPayload(): Promise<Payload> {
  const { GET } = await import('@/app/api/admin/metrics/route');
  const response = await GET(new Request('http://localhost/api/admin/metrics') as never);
  expect(response.status).toBe(200);
  return (await response.json()) as Payload;
}

describe('GET /api/admin/metrics when coursera_xapi_events is absent', () => {
  it('lists the gap under `degraded` and keeps every existing number', async () => {
    mockDatabase(false);
    const body = await getPayload();

    expect(body.degraded).toEqual(['coursera-xapi-unavailable']);
    // The unmatched count still comes from the loader (without the xAPI branch), not a 0 fallback.
    expect(body.summary.unmatchedCoursera).toBe(9);
    expect(body.summary.totalMembers).toBe(40);
    expect(body.summary.enrolledMembers).toBe(12);
    expect(body.funnels).toHaveLength(6);
    expect(Object.keys(body.trends).sort()).toEqual(['dashboardViews', 'enrollments', 'signups']);
    expect(error).not.toHaveBeenCalled();
    for (const call of otherCalls()) {
      expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/coursera_xapi_events/);
    }
  });
});

describe('GET /api/admin/metrics when coursera_xapi_events is present (production path)', () => {
  it('maps the two distinct member event counts to the activation funnel', async () => {
    mockDatabase(true, { viewers: 3, activated: 1 });
    const body = await getPayload();

    expect(body.summary.activeDashboardUsers).toBe(3);
    expect(body.summary.activationRate).toBe(33);
    expect(body.funnels).toContainEqual(expect.objectContaining({
      name: 'Dashboard Activation', current: 1, target: 3, rate: 33,
    }));

    const engagementCalls = otherCalls().filter((call) =>
      /FILTER \(WHERE me\.event_name = 'member_dashboard_viewed'\)/.test(
        (call[0] as TemplateStringsArray).join(''),
      ),
    );
    expect(engagementCalls).toHaveLength(1);
    const sql = (engagementCalls[0][0] as TemplateStringsArray).join('');
    expect(sql.match(/COUNT\(DISTINCT me\.user_id\) FILTER/g)).toHaveLength(2);
    expect(sql).toContain("WHERE me.event_name IN ('member_dashboard_viewed', 'member_dashboard_activated')");
    expect(engagementCalls[0]).toContain('org-1');
  });

  it('returns an empty `degraded` list, the same numbers, and asks the catalog exactly once', async () => {
    mockDatabase(true);
    const body = await getPayload();

    expect(body.degraded).toEqual([]);
    expect(body.summary.unmatchedCoursera).toBe(9);
    expect(body.summary.totalMembers).toBe(40);
    expect(probeCalls()).toHaveLength(1);
    for (const call of otherCalls()) {
      expect((call[0] as TemplateStringsArray).join('')).not.toMatch(/to_regclass|information_schema/);
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
