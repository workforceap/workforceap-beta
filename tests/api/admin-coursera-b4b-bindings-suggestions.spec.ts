// @vitest-environment node
/**
 * GET /api/admin/coursera/b4b-bindings-suggestions matches the catalog to
 * the live B4B directory. Unsigned is 401. Actor-org throw and non-admin
 * are 403 before the matcher. Super-admin skips isAdminInOrg. The matcher
 * is called with no org — pin that. B4B throw is 502 with the message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  getBindingSuggestions: vi.fn(),
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

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdminInOrg: h.isAdminInOrg,
  isSuperAdmin: h.isSuperAdmin,
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/coursera/b4bBindingSuggestions.server', () => ({
  getBindingSuggestions: h.getBindingSuggestions,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { GET } = await import('@/app/api/admin/coursera/b4b-bindings-suggestions/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request() {
  return new Request('http://localhost/api/admin/coursera/b4b-bindings-suggestions');
}

const report = {
  totalCatalogPrograms: 3,
  totalB4BPrograms: 1,
  alreadyBound: 0,
  exactMatches: 0,
  partialMatches: 0,
  unmatched: 3,
  umbrella: { id: 'b4b-umbrella', name: 'WAP Umbrella', slug: 'wap' },
  suggestions: [],
};

describe('GET /api/admin/coursera/b4b-bindings-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.isSuperAdmin.mockResolvedValue(false);
    h.isAdminInOrg.mockResolvedValue(true);
    h.getBindingSuggestions.mockResolvedValue(report);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.getBindingSuggestions).not.toHaveBeenCalled();
  });

  it('returns 403 when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.getBindingSuggestions).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 403 before the matcher when the caller is not an admin in the actor org', async () => {
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(403);
    expect(h.isAdminInOrg).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
    expect(h.getBindingSuggestions).not.toHaveBeenCalled();
  });

  it('lets a super-admin match without isAdminInOrg and without passing org to the matcher', async () => {
    h.isSuperAdmin.mockResolvedValue(true);
    h.isAdminInOrg.mockResolvedValue(false);
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.isAdminInOrg).not.toHaveBeenCalled();
    expect(h.getBindingSuggestions).toHaveBeenCalledTimes(1);
    expect(h.getBindingSuggestions).toHaveBeenCalledWith();
    const body = await res.json();
    expect(body.umbrella).toEqual(report.umbrella);
    expect(body.patchHint).toContain("const COURSERA_UMBRELLA_B4B_ID = 'b4b-umbrella';");
  });

  it('returns the report plus patchHint for an org admin', async () => {
    const res = await GET(request() as never);
    expect(res.status).toBe(200);
    expect(h.getBindingSuggestions).toHaveBeenCalledWith();
    const body = await res.json();
    expect(body.totalB4BPrograms).toBe(1);
    expect(body.patchHint).toContain('b4b-umbrella');
  });

  it('returns 502 with the B4B message when the matcher throws', async () => {
    h.getBindingSuggestions.mockRejectedValue(new Error('B4B directory unavailable'));
    const res = await GET(request() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'B4B directory unavailable' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
