// @vitest-environment node
/**
 * POST /api/member/enrollments/[id]/set-primary promotes one of the
 * member's enrollments. Unsigned is 401. A missing id is 400. Lookup is
 * by enrollment id only; a row owned by someone else is 404 with no write
 * (do not leak that it exists). Already-primary is a no-op. A real
 * promotion demotes other primaries and copies the slug onto
 * User.enrolledProgram.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  updateEnrollment: vi.fn(),
  updateUser: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          courseEnrollment: {
            findUnique: typeof h.findUnique;
            updateMany: typeof h.updateMany;
            update: typeof h.updateEnrollment;
          };
          user: { update: typeof h.updateUser };
        }) => unknown,
      ) =>
        fn({
          courseEnrollment: {
            findUnique: h.findUnique,
            updateMany: h.updateMany,
            update: h.updateEnrollment,
          },
          user: { update: h.updateUser },
        }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { POST } = await import('@/app/api/member/enrollments/[id]/set-primary/route');

const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_ID = '550e8400-e29b-41d4-a716-446655440099';
const ENROLLMENT_ID = '550e8400-e29b-41d4-a716-446655440010';

function request(id = ENROLLMENT_ID) {
  return new Request(`http://localhost/api/member/enrollments/${id}/set-primary`, {
    method: 'POST',
  });
}

function params(id = ENROLLMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

const ownSecondary = {
  id: ENROLLMENT_ID,
  userId: MEMBER_ID,
  programSlug: 'cybersecurity',
  isPrimary: false,
};

describe('POST /api/member/enrollments/[id]/set-primary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: MEMBER_ID });
    h.findUnique.mockResolvedValue(ownSecondary);
    h.updateMany.mockResolvedValue({ count: 1 });
    h.updateEnrollment.mockResolvedValue({ ...ownSecondary, isPrimary: true });
    h.updateUser.mockResolvedValue({ id: MEMBER_ID });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before lookup when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await POST(request() as never, params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.updateEnrollment).not.toHaveBeenCalled();
  });

  it('returns 400 without lookup when the enrollment id is blank', async () => {
    const res = await POST(request('') as never, params(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing enrollment id' });
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('looks up by id only and returns 404 without a write when the row belongs to someone else', async () => {
    h.findUnique.mockResolvedValue({ ...ownSecondary, userId: OTHER_ID });
    const res = await POST(request() as never, params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Enrollment not found' });
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { id: ENROLLMENT_ID },
      select: { id: true, userId: true, programSlug: true, isPrimary: true },
    });
    expect(h.findUnique.mock.calls[0][0].where).not.toHaveProperty('userId');
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.updateEnrollment).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('returns 404 without a write when the enrollment id is missing', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await POST(request() as never, params());
    expect(res.status).toBe(404);
    expect(h.updateEnrollment).not.toHaveBeenCalled();
  });

  it('is a no-op when the enrollment is already primary', async () => {
    h.findUnique.mockResolvedValue({ ...ownSecondary, isPrimary: true });
    const res = await POST(request() as never, params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      enrollmentId: ENROLLMENT_ID,
      programSlug: 'cybersecurity',
      changed: false,
    });
    expect(h.updateMany).not.toHaveBeenCalled();
    expect(h.updateEnrollment).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('demotes other primaries and copies the slug onto User.enrolledProgram', async () => {
    const res = await POST(request() as never, params());
    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { userId: MEMBER_ID, isPrimary: true, id: { not: ENROLLMENT_ID } },
      data: { isPrimary: false },
    });
    expect(h.updateEnrollment).toHaveBeenCalledWith({
      where: { id: ENROLLMENT_ID },
      data: { isPrimary: true },
    });
    expect(h.updateUser).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { enrolledProgram: 'cybersecurity' },
    });
    expect(await res.json()).toEqual({
      ok: true,
      enrollmentId: ENROLLMENT_ID,
      programSlug: 'cybersecurity',
      changed: true,
    });
  });

  it('returns 500 Internal server error when lookup throws', async () => {
    h.findUnique.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(request() as never, params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
