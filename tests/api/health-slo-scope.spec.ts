// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  getUser: vi.fn(), isAdminInOrg: vi.fn(), isSuperAdmin: vi.fn(), getActorOrganizationId: vi.fn(),
  query: vi.fn(), email: vi.fn(), xapi: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: fixtures.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdminInOrg: fixtures.isAdminInOrg, isSuperAdmin: fixtures.isSuperAdmin }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: fixtures.getActorOrganizationId }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: fixtures.query } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: (request: Request) => Promise<Response>) => handler }));
vi.mock('@/lib/observability/sloMetrics', () => ({ measureEmailDelivery: fixtures.email, measureCourseraIngestion: fixtures.xapi }));
vi.mock('@/lib/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { GET } from '@/app/api/health/slo/route';

function request() {
  return GET(new Request('https://other-tenant.example/api/health/slo'));
}

describe('SLO endpoint authorization and scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.getUser.mockResolvedValue({ id: 'admin-fixture' });
    fixtures.isSuperAdmin.mockResolvedValue(false);
    fixtures.isAdminInOrg.mockResolvedValue(true);
    fixtures.getActorOrganizationId.mockResolvedValue('org-fixture');
    fixtures.query.mockResolvedValue([{ total: BigInt(100), errors: BigInt(0), current: BigInt(1), max_conn: BigInt(100) }]);
    fixtures.email.mockResolvedValue({ id: 'email_delivered_5min', status: 'within', current: '100.00%' });
    fixtures.xapi.mockResolvedValue({ id: 'coursera_xapi_ingestion', status: 'within', current: '100.00%' });
    vi.stubEnv('VERCEL_ANALYTICS_TOKEN', 'fixture-token');
    vi.stubEnv('VERCEL_PROJECT_ID', 'private-project-id');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ p95: 300 }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('rejects anonymous users before reading any telemetry', async () => {
    fixtures.getUser.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(fixtures.query).not.toHaveBeenCalled();
    expect(fixtures.email).not.toHaveBeenCalled();
  });

  it('rejects non-admins and missing membership before reading observations', async () => {
    fixtures.isAdminInOrg.mockResolvedValue(false);
    expect((await request()).status).toBe(403);
    fixtures.getActorOrganizationId.mockRejectedValue(new Error('no membership'));
    expect((await request()).status).toBe(403);
    expect(fixtures.query).not.toHaveBeenCalled();
    expect(fixtures.xapi).not.toHaveBeenCalled();
  });

  it('scopes tenant observations to actor membership even on a different host and hides platform metrics', async () => {
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fixtures.isAdminInOrg).toHaveBeenCalledWith('admin-fixture', 'org-fixture');
    expect(fixtures.email).toHaveBeenCalledWith('org-fixture', expect.any(Date));
    expect(fixtures.xapi).toHaveBeenCalledWith('org-fixture', expect.any(Date));
    expect(fixtures.query.mock.calls[0].slice(1)).toContain('org-fixture');
    expect(fixtures.query).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(body.slos.find((slo: { id: string }) => slo.id === 'db_pool_utilization')).toMatchObject({ current: null, status: 'unknown' });
    expect(JSON.stringify(body)).not.toMatch(/org-fixture|admin-fixture|private-project-id|fixture-token/);
  });

  it('lets a super admin read all recorded observations and project telemetry', async () => {
    fixtures.isSuperAdmin.mockResolvedValue(true);
    const response = await request();
    expect(response.status).toBe(200);
    expect(fixtures.email).toHaveBeenCalledWith(null, expect.any(Date));
    expect(fixtures.xapi).toHaveBeenCalledWith(null, expect.any(Date));
    expect(fixtures.getActorOrganizationId).not.toHaveBeenCalled();
    expect(fixtures.query).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await response.json()).slos.find((slo: { id: string }) => slo.id === 'dashboard_latency_p95')).toMatchObject({ current: '300 ms', status: 'within' });
  });

  it('never publishes a negative latency as a healthy measurement', async () => {
    fixtures.isSuperAdmin.mockResolvedValue(true);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ p95: -30 }), { status: 200 }));
    const body = await (await request()).json();
    expect(body.slos.find((slo: { id: string }) => slo.id === 'dashboard_latency_p95')).toMatchObject({ current: null, status: 'unknown' });
    expect(body.slos.find((slo: { id: string }) => slo.id === 'uptime')).toMatchObject({ current: null, status: 'unknown' });
  });
});
