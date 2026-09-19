import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isAdminInOrg: vi.fn(),
  isSuperAdmin: vi.fn(),
  getOrg: vi.fn(),
  transaction: vi.fn(),
  userFindMany: vi.fn(),
  statementFindMany: vi.fn(),
  upsertProgress: vi.fn(),
  withTenantScope: vi.fn(),
  tenantUserFindMany: vi.fn(),
  syncUserFromB4B: vi.fn(),
  parse: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json' },
        }),
    },
  };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: mocks.isAdmin,
  isAdminInOrg: mocks.isAdminInOrg,
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: mocks.getOrg }));
vi.mock('@/lib/tenant/withTenantScope', () => ({ withTenantScope: mocks.withTenantScope }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/xapi/statementModel', () => ({
  parseXapiStatement: mocks.parse,
  isXapiCompletionVerb: () => true,
  isXapiCourseProgressVerb: () => true,
}));
vi.mock('@/lib/member/courseProgress', () => ({
  upsertCourseProgressFromXapiStatement: mocks.upsertProgress,
}));
vi.mock('@/lib/coursera/syncUserFromB4B', () => ({ syncUserFromB4B: mocks.syncUserFromB4B }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { POST as backfillPost } from '@/app/api/admin/coursera/backfill-xapi/route';
import { POST as syncPost } from '@/app/api/admin/coursera/sync-user-from-b4b/route';

/**
 * `{ equals, mode: 'insensitive' }` compiles to PostgreSQL `ILIKE`, so `_` and
 * `%` in the admin-supplied address are wildcards: `m_johnson@…` also matches
 * `mrjohnson@…`. Both routes write to whichever member they resolve, so a
 * pattern hit on a same-shaped neighbour must not resolve.
 */
const PATTERN_ADDRESS = 'm_johnson@example.com';

function backfillRequest(email: string) {
  return new Request('http://localhost/api/admin/coursera/backfill-xapi', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

function syncRequest(email: string) {
  return new Request('http://localhost/api/admin/coursera/sync-user-from-b4b', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/admin/coursera/backfill-xapi email matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-1' });
    mocks.isAdmin.mockResolvedValue(true);
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.getOrg.mockResolvedValue('org-1');
    mocks.statementFindMany.mockResolvedValue([
      {
        statementId: 'statement-1',
        actorEmail: PATTERN_ADDRESS,
        verb: 'http://adlnet.gov/expapi/verbs/completed',
        courseId: 'course-1',
        courseName: 'Course One',
        resultScoreScaled: 1,
        resultScoreRaw: null,
        resultCompletion: true,
        resultSuccess: true,
        createdAt: new Date(),
      },
    ]);
    mocks.parse.mockReturnValue({ statementId: 'statement-1', courseSlug: 'course-one' });
    mocks.upsertProgress.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        user: { findMany: mocks.userFindMany },
        xapiStatement: { findMany: mocks.statementFindMany },
      }),
    );
  });

  it('does not backfill a same-shaped neighbour when only the pattern matches', async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'neighbour-user',
        email: 'mrjohnson@example.com',
        fullName: 'Mr Johnson',
        enrolledProgram: 'program-one',
      },
    ]);

    const response = await backfillPost(backfillRequest(PATTERN_ADDRESS));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: 'Member not found' });
    expect(mocks.upsertProgress).not.toHaveBeenCalled();
  });

  it('ignores neighbour rows the pattern swept in and credits only the exact member', async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'neighbour-user',
        email: 'mrjohnson@example.com',
        fullName: 'Mr Johnson',
        enrolledProgram: 'program-one',
      },
      {
        id: 'owner-user',
        email: 'm_johnson@example.com',
        fullName: 'M Johnson',
        enrolledProgram: 'program-two',
      },
    ]);

    const response = await backfillPost(backfillRequest(PATTERN_ADDRESS));

    expect(response.status).toBe(200);
    expect(mocks.upsertProgress).toHaveBeenCalledTimes(1);
    expect(mocks.upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-user', enrolledProgramSlug: 'program-two' }),
    );
  });

  it('still credits an ordinary exact address, case-insensitively, with a bounded read', async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'Learner@Example.com',
        fullName: 'Learner',
        enrolledProgram: 'program-one',
      },
    ]);

    const response = await backfillPost(backfillRequest('learner@example.com'));

    expect(response.status).toBe(200);
    expect(mocks.upsertProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', enrolledProgramSlug: 'program-one' }),
    );
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: {
        email: { mode: 'insensitive', equals: 'learner@example.com' },
        organizationId: 'org-1',
      },
      select: { id: true, email: true, fullName: true, enrolledProgram: true },
      take: 25,
    });
  });
});

describe('POST /api/admin/coursera/sync-user-from-b4b email matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ id: 'admin-1' });
    mocks.getOrg.mockResolvedValue('org-1');
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.isAdminInOrg.mockResolvedValue(true);
    mocks.syncUserFromB4B.mockResolvedValue({ ok: true });
    mocks.withTenantScope.mockImplementation(async (_org: string, callback: (db: unknown) => unknown) =>
      callback({ user: { findMany: mocks.tenantUserFindMany } }),
    );
  });

  it('does not sync a same-shaped neighbour when only the pattern matches', async () => {
    mocks.tenantUserFindMany.mockResolvedValue([
      {
        id: 'neighbour-user',
        email: 'mrjohnson@example.com',
        organizationId: 'org-1',
        enrolledProgram: 'program-one',
      },
    ]);

    const response = await syncPost(syncRequest(PATTERN_ADDRESS));

    expect(response.status).toBe(404);
    expect(mocks.syncUserFromB4B).not.toHaveBeenCalled();
  });

  it('ignores neighbour rows the pattern swept in and syncs only the exact member', async () => {
    mocks.tenantUserFindMany.mockResolvedValue([
      {
        id: 'neighbour-user',
        email: 'mrjohnson@example.com',
        organizationId: 'org-1',
        enrolledProgram: 'program-one',
      },
      {
        id: 'owner-user',
        email: 'm_johnson@example.com',
        organizationId: 'org-1',
        enrolledProgram: 'program-two',
      },
    ]);

    const response = await syncPost(syncRequest(PATTERN_ADDRESS));

    expect(response.status).toBe(200);
    expect(mocks.syncUserFromB4B).toHaveBeenCalledTimes(1);
    expect(mocks.syncUserFromB4B).toHaveBeenCalledWith(
      expect.objectContaining({
        email: PATTERN_ADDRESS,
        wapUserId: 'owner-user',
        existingEnrolledProgram: 'program-two',
      }),
    );
  });

  it('still syncs an ordinary exact address, case-insensitively, with a bounded read', async () => {
    mocks.tenantUserFindMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'Learner@Example.com',
        organizationId: 'org-1',
        enrolledProgram: 'program-one',
      },
    ]);

    const response = await syncPost(syncRequest('learner@example.com'));

    expect(response.status).toBe(200);
    expect(mocks.syncUserFromB4B).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'learner@example.com', wapUserId: 'user-1' }),
    );
    expect(mocks.tenantUserFindMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        email: { equals: 'learner@example.com', mode: 'insensitive' },
      },
      select: {
        id: true,
        email: true,
        organizationId: true,
        enrolledProgram: true,
      },
      take: 25,
    });
  });
});
