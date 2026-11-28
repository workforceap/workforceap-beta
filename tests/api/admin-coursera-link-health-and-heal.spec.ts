// @vitest-environment node
/**
 * GET /api/admin/coursera/link-health and POST /auto-heal are global
 * Coursera repair paths: unsigned and non-admin both answer 401 (not
 * 403), and neither helper is passed an organizationId — pin that.
 * GET auto-heal is 405.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  auditCourseraLinkHealth: vi.fn(),
  autoHealUnmatchedXapiEvents: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/coursera/linkHealth', () => ({
  auditCourseraLinkHealth: h.auditCourseraLinkHealth,
}));

vi.mock('@/lib/xapi/reprocess', () => ({
  autoHealUnmatchedXapiEvents: h.autoHealUnmatchedXapiEvents,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { GET: getHealth } = await import('@/app/api/admin/coursera/link-health/route');
const { GET: getHeal, POST: postHeal } = await import('@/app/api/admin/coursera/auto-heal/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function getRequest(path: string) {
  return new Request(`http://localhost${path}`);
}

function postRequest() {
  return new Request('http://localhost/api/admin/coursera/auto-heal', { method: 'POST' });
}

const health = { mappedIdentities: 12, orphanCourseProgress: 3, unmatchedXapi: 1 };
const healResult = { scanned: 40, healed: 2, remaining: 1 };

describe('GET /api/admin/coursera/link-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.auditCourseraLinkHealth.mockResolvedValue(health);
  });

  it('returns 401 before the audit when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await getHealth(getRequest('/api/admin/coursera/link-health') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.isAdmin).not.toHaveBeenCalled();
    expect(h.auditCourseraLinkHealth).not.toHaveBeenCalled();
  });

  it('returns 401 (not 403) before the audit when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await getHealth(getRequest('/api/admin/coursera/link-health') as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.auditCourseraLinkHealth).not.toHaveBeenCalled();
  });

  it('returns the health report without passing an organizationId (pinned)', async () => {
    const res = await getHealth(getRequest('/api/admin/coursera/link-health') as never);
    expect(res.status).toBe(200);
    expect(h.auditCourseraLinkHealth).toHaveBeenCalledTimes(1);
    expect(h.auditCourseraLinkHealth).toHaveBeenCalledWith();
    expect(await res.json()).toEqual({ ok: true, health });
  });

  it('returns 500 when the audit throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.auditCourseraLinkHealth.mockRejectedValue(new Error('db down'));
    const res = await getHealth(getRequest('/api/admin/coursera/link-health') as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unable to load Coursera link health.' });
    spy.mockRestore();
  });
});

describe('POST /api/admin/coursera/auto-heal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.autoHealUnmatchedXapiEvents.mockResolvedValue(healResult);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before heal when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await postHeal(postRequest() as never);
    expect(res.status).toBe(401);
    expect(h.autoHealUnmatchedXapiEvents).not.toHaveBeenCalled();
  });

  it('returns 401 (not 403) before heal when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await postHeal(postRequest() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.autoHealUnmatchedXapiEvents).not.toHaveBeenCalled();
  });

  it('heals with a 200-event cap and no organizationId (pinned)', async () => {
    const res = await postHeal(postRequest() as never);
    expect(res.status).toBe(200);
    expect(h.autoHealUnmatchedXapiEvents).toHaveBeenCalledTimes(1);
    expect(h.autoHealUnmatchedXapiEvents).toHaveBeenCalledWith(200);
    expect(h.autoHealUnmatchedXapiEvents.mock.calls[0]).toHaveLength(1);
    expect(await res.json()).toEqual({ ok: true, result: healResult });
  });

  it('returns 500 when heal throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.autoHealUnmatchedXapiEvents.mockRejectedValue(new Error('xAPI store down'));
    const res = await postHeal(postRequest() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Unable to auto-heal unmatched xAPI events.' });
    spy.mockRestore();
  });
});

describe('GET /api/admin/coursera/auto-heal', () => {
  it('returns 405 without healing', async () => {
    vi.clearAllMocks();
    const res = await getHeal(getRequest('/api/admin/coursera/auto-heal') as never);
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'Use POST to trigger auto-heal' });
    expect(h.autoHealUnmatchedXapiEvents).not.toHaveBeenCalled();
  });
});
