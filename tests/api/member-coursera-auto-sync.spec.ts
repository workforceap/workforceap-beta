// @vitest-environment node
/**
 * POST /api/member/coursera/auto-sync is self-only. Unsigned is 401.
 * Missing email skips without B4B. Actor-org throw is 403. A missing
 * tenant user is 401. Backoff and existing CourseProgress skip (the
 * latter still stamps). Empty mappings currently fall back to the WAP
 * email and still sync — pin that. B4B throw is 502 and echoes the
 * upstream message, then stamps anyway.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  getActorOrganizationId: vi.fn(),
  findUnique: vi.fn(),
  listMappings: vi.fn(),
  syncUserFromB4B: vi.fn(),
  markUserAutoSynced: vi.fn(),
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

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_org: string, fn: (db: { user: { findUnique: typeof h.findUnique } }) => unknown) =>
    fn({ user: { findUnique: h.findUnique } }),
  ),
}));

vi.mock('@/lib/xapi/mappings', () => ({
  listCourseraIdentityMappingsForUser: h.listMappings,
}));

vi.mock('@/lib/coursera/syncUserFromB4B', () => ({
  syncUserFromB4B: h.syncUserFromB4B,
  markUserAutoSynced: h.markUserAutoSynced,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

const { POST } = await import('@/app/api/member/coursera/auto-sync/route');

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';

function request() {
  return new Request('http://localhost/api/member/coursera/auto-sync', { method: 'POST' });
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    email: 'learner@example.test',
    enrolledProgram: 'it-support',
    lastCourseraAutoSyncAt: null,
    organizationId: ORG_ID,
    _count: { courseProgress: 0 },
    ...overrides,
  };
}

describe('POST /api/member/coursera/auto-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: MEMBER_ID, email: 'learner@example.test' });
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.findUnique.mockResolvedValue(dbUser());
    h.listMappings.mockResolvedValue([{ courseraEmail: 'coursera@example.test' }]);
    h.syncUserFromB4B.mockResolvedValue({
      mapped: { seededEnrollments: 2, updatedEnrollments: 0 },
      message: 'Synced 2 enrollments',
    });
    h.markUserAutoSynced.mockResolvedValue(undefined);
  });

  it('returns 401 before org resolution when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('skips without B4B when the auth user has no email', async () => {
    h.getUser.mockResolvedValue({ id: MEMBER_ID, email: null });
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      didSync: false,
      message: 'No email on file; cannot auto-sync.',
    });
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('returns 403 before the tenant read when actor-org resolution throws', async () => {
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await POST(request() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
    expect(h.captureApiError).toHaveBeenCalled();
  });

  it('returns 401 without B4B when the tenant-scoped user row is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await POST(request() as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      select: expect.objectContaining({ id: true, email: true, organizationId: true }),
    });
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('skips without stamping when last sync is inside the backoff window', async () => {
    h.findUnique.mockResolvedValue(dbUser({ lastCourseraAutoSyncAt: new Date() }));
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      didSync: false,
      message: 'Auto-sync skipped — last sync was within the backoff window.',
    });
    expect(h.markUserAutoSynced).not.toHaveBeenCalled();
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('skips and stamps when local CourseProgress rows already exist', async () => {
    h.findUnique.mockResolvedValue(dbUser({ _count: { courseProgress: 3 } }));
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      didSync: false,
      message: 'Auto-sync skipped — local CourseProgress rows already exist.',
    });
    expect(h.markUserAutoSynced).toHaveBeenCalledWith({ userId: MEMBER_ID, orgId: ORG_ID });
    expect(h.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('falls back to the WAP email and still syncs when mappings are empty (pinned)', async () => {
    h.listMappings.mockResolvedValue([]);
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.syncUserFromB4B).toHaveBeenCalledWith({
      email: 'learner@example.test',
      wapUserId: MEMBER_ID,
      orgId: ORG_ID,
      enrolledByAdmin: null,
      existingEnrolledProgram: 'it-support',
    });
    expect(h.markUserAutoSynced).toHaveBeenCalledWith({ userId: MEMBER_ID, orgId: ORG_ID });
    expect(await res.json()).toEqual({
      ok: true,
      didSync: true,
      message: 'Synced 2 enrollments',
    });
  });

  it('lowercases the Coursera mapping email and reports didSync from seeded/updated counts', async () => {
    h.listMappings.mockResolvedValue([{ courseraEmail: 'Learner@Coursera.Example' }]);
    h.syncUserFromB4B.mockResolvedValue({
      mapped: { seededEnrollments: 0, updatedEnrollments: 0 },
      message: 'No enrollments matched',
    });
    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(h.syncUserFromB4B).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'learner@coursera.example', enrolledByAdmin: null }),
    );
    expect(await res.json()).toEqual({
      ok: true,
      didSync: false,
      message: 'No enrollments matched',
    });
  });

  it('returns 502 with the upstream message and still stamps when B4B throws (pinned)', async () => {
    h.syncUserFromB4B.mockRejectedValue(new Error('invalid client credentials'));
    const res = await POST(request() as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      ok: false,
      didSync: false,
      message: 'Auto-sync failed: invalid client credentials',
    });
    expect(h.markUserAutoSynced).toHaveBeenCalledWith({ userId: MEMBER_ID, orgId: ORG_ID });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
