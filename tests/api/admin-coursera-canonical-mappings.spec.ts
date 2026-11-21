// @vitest-environment node
/**
 * POST/DELETE /api/admin/coursera/canonical-course-mappings rewrite global
 * Coursera→catalog mappings. Unsigned and non-admin both 401 (pinned, not
 * 403). The upsert/delete are by courseraCourseId with no organizationId —
 * pin that. Progress promotion after save is actor-org scoped and take 100.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProgramBySlug } from '@/lib/content/programs';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  getActorOrganizationId: vi.fn(),
  upsert: vi.fn(),
  findManyProgress: vi.fn(),
  deleteMany: vi.fn(),
  promote: vi.fn(),
  auditLog: vi.fn(),
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

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: h.getActorOrganizationId,
}));

vi.mock('@/lib/coursera/csvImport.server', () => ({
  promoteCsvProgressToCanonical: h.promote,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    courseraCanonicalCourseMapping: { upsert: h.upsert, deleteMany: h.deleteMany },
    courseraCourseProgress: { findMany: h.findManyProgress },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
  };
});

const { POST, DELETE } = await import('@/app/api/admin/coursera/canonical-course-mappings/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440002';
const PROGRAM = 'it-support-professional-certificate-ibm';
const COURSE = getProgramBySlug(PROGRAM)!.courses[0]!;

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/admin/coursera/canonical-course-mappings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function del(query = '') {
  return DELETE(new Request(`http://localhost/api/admin/coursera/canonical-course-mappings${query}`));
}

const validBody = {
  courseraCourseId: 'Course~abc',
  courseraCourseSlug: 'intro-to-technical-support',
  canonicalProgramSlug: PROGRAM,
  canonicalCourseSlug: COURSE.slug,
  notes: 'mapped',
};

describe('POST /api/admin/coursera/canonical-course-mappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.getActorOrganizationId.mockResolvedValue(ORG_ID);
    h.upsert.mockResolvedValue({ id: 'map-1', ...validBody });
    h.findManyProgress.mockResolvedValue([]);
    h.promote.mockResolvedValue({ upserted: 0 });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-admin (not 403)', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(h.getActorOrganizationId).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('{');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when required mapping fields are missing', async () => {
    const missingId = await post({ canonicalProgramSlug: PROGRAM, canonicalCourseSlug: COURSE.slug });
    expect(missingId.status).toBe(400);
    expect(await missingId.json()).toEqual({ error: 'courseraCourseId is required' });
    const missingProgram = await post({ courseraCourseId: 'Course~abc', canonicalCourseSlug: COURSE.slug });
    expect(missingProgram.status).toBe(400);
    const missingCourse = await post({
      courseraCourseId: 'Course~abc',
      canonicalProgramSlug: PROGRAM,
    });
    expect(missingCourse.status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 when the canonical program or course is not in the catalog', async () => {
    const badProgram = await post({ ...validBody, canonicalProgramSlug: 'not-a-program' });
    expect(badProgram.status).toBe(400);
    expect((await badProgram.json()).error).toMatch(/No canonical program/);
    const badCourse = await post({ ...validBody, canonicalCourseSlug: 'not-a-course' });
    expect(badCourse.status).toBe(400);
    expect((await badCourse.json()).error).toMatch(/has no course with slug/);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it('upserts globally by courseraCourseId then promotes actor-org progress take 100', async () => {
    h.findManyProgress.mockResolvedValue([{ userId: 'm-1' }, { userId: 'm-2' }]);
    h.promote.mockResolvedValueOnce({ upserted: 3 }).mockResolvedValueOnce({ upserted: 1 });
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(h.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { courseraCourseId: 'Course~abc' },
        create: expect.objectContaining({
          courseraCourseId: 'Course~abc',
          canonicalProgramSlug: PROGRAM,
          canonicalCourseSlug: COURSE.slug,
          createdById: ADMIN_ID,
        }),
      }),
    );
    const create = h.upsert.mock.calls[0][0].create as Record<string, unknown>;
    expect(create).not.toHaveProperty('organizationId');
    expect(h.findManyProgress).toHaveBeenCalledWith({
      where: { courseraCourseId: 'Course~abc', organizationId: ORG_ID, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
      take: 100,
    });
    expect(h.promote).toHaveBeenCalledWith({ organizationId: ORG_ID, userId: 'm-1' });
    expect(h.promote).toHaveBeenCalledWith({ organizationId: ORG_ID, userId: 'm-2' });
    expect(await res.json()).toEqual({
      ok: true,
      mapping: { id: 'map-1', ...validBody },
      promotedRows: 4,
      affectedUsers: 2,
    });
  });

  it('returns 500 when actor-org resolution throws after admin auth', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getActorOrganizationId.mockRejectedValue(new Error('org down'));
    const res = await post(validBody);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(h.upsert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('DELETE /api/admin/coursera/canonical-course-mappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.deleteMany.mockResolvedValue({ count: 1 });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before delete when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await del('?courseraCourseId=Course~abc');
    expect(res.status).toBe(401);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 400 when courseraCourseId is missing', async () => {
    const res = await del();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'courseraCourseId query param is required' });
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes by courseraCourseId with no organizationId', async () => {
    const res = await del('?courseraCourseId=Course~abc');
    expect(res.status).toBe(200);
    expect(h.deleteMany).toHaveBeenCalledWith({ where: { courseraCourseId: 'Course~abc' } });
    const where = h.deleteMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).not.toHaveProperty('organizationId');
    expect(await res.json()).toEqual({ ok: true });
  });
});
