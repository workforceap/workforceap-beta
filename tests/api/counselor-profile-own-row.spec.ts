// @vitest-environment node
/**
 * GET/PATCH /api/counselor/profile is own-row only. Unsigned is 401.
 * Non-counselor is 403 before lookup. Lookup is userId+active on the
 * counselor table — there is no counselor id in the URL. PATCH writes
 * the caller's users row, profiles.profilePhone, and counselors.title.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isCounselor: vi.fn(),
  findFirst: vi.fn(),
  userUpdate: vi.fn(),
  profileUpdateMany: vi.fn(),
  counselorUpdate: vi.fn(),
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
  isCounselor: h.isCounselor,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          counselor: { findFirst: typeof h.findFirst; update: typeof h.counselorUpdate };
          user: { update: typeof h.userUpdate };
          profile: { updateMany: typeof h.profileUpdateMany };
        }) => unknown,
      ) =>
        fn({
          counselor: { findFirst: h.findFirst, update: h.counselorUpdate },
          user: { update: h.userUpdate },
          profile: { updateMany: h.profileUpdateMany },
        }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

const { GET, PATCH } = await import('@/app/api/counselor/profile/route');

const COUNSELOR_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const COUNSELOR_ID = '550e8400-e29b-41d4-a716-446655440020';

function getRequest() {
  return new Request('http://localhost/api/counselor/profile');
}

function patchRequest(body?: unknown) {
  return new Request('http://localhost/api/counselor/profile', {
    method: 'PATCH',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const ownRow = {
  id: COUNSELOR_ID,
  title: 'Career Coach',
  affiliation: 'Capital Area',
  partner: { name: 'Capital Area Workforce' },
  user: { fullName: 'Jordan Advisor', email: 'jordan@example.test', phone: '512-555-0100' },
  _count: { assignments: 4 },
};

describe('GET /api/counselor/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: COUNSELOR_USER_ID });
    h.isCounselor.mockResolvedValue(true);
    h.findFirst.mockResolvedValue(ownRow);
  });

  it('returns 401 before isCounselor when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(401);
    expect(h.isCounselor).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 before lookup when the caller is not a counselor', async () => {
    h.isCounselor.mockResolvedValue(false);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('loads the active counselor row for the caller userId only', async () => {
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(200);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { userId: COUNSELOR_USER_ID, active: true },
      select: {
        id: true,
        title: true,
        affiliation: true,
        partner: { select: { name: true } },
        user: { select: { fullName: true, email: true, phone: true } },
        _count: { select: { assignments: { where: { active: true } } } },
      },
    });
    expect(h.findFirst.mock.calls[0][0].where).not.toHaveProperty('id');
    expect(await res.json()).toEqual({
      profile: {
        fullName: 'Jordan Advisor',
        email: 'jordan@example.test',
        phone: '512-555-0100',
        title: 'Career Coach',
        affiliation: 'Capital Area',
        partnerName: 'Capital Area Workforce',
        activeAssignments: 4,
      },
    });
  });

  it('returns 404 when the caller has no active counselor row', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await GET(getRequest() as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Counselor profile not found' });
  });
});

describe('PATCH /api/counselor/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: COUNSELOR_USER_ID });
    h.isCounselor.mockResolvedValue(true);
    h.findFirst.mockResolvedValue({ id: COUNSELOR_ID });
    h.userUpdate.mockResolvedValue({ id: COUNSELOR_USER_ID });
    h.profileUpdateMany.mockResolvedValue({ count: 1 });
    h.counselorUpdate.mockResolvedValue({ id: COUNSELOR_ID });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before isCounselor when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ fullName: 'Jordan Advisor' }) as never);
    expect(res.status).toBe(401);
    expect(h.isCounselor).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 before parse when the caller is not a counselor', async () => {
    h.isCounselor.mockResolvedValue(false);
    const res = await PATCH(patchRequest({ fullName: 'Jordan Advisor' }) as never);
    expect(res.status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid JSON without a write', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/counselor/profile', {
        method: 'PATCH',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 without a write when fullName is too short', async () => {
    const res = await PATCH(patchRequest({ fullName: 'J' }) as never);
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('updates the caller user, profile phone, and counselor title for the own row', async () => {
    const res = await PATCH(
      patchRequest({ fullName: 'Jordan Advisor', phone: ' 512-555-0199 ', title: ' Lead Coach ' }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { userId: COUNSELOR_USER_ID, active: true },
      select: { id: true },
    });
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: COUNSELOR_USER_ID },
      data: { fullName: 'Jordan Advisor', phone: '512-555-0199' },
    });
    expect(h.profileUpdateMany).toHaveBeenCalledWith({
      where: { userId: COUNSELOR_USER_ID },
      data: { profilePhone: '512-555-0199' },
    });
    expect(h.counselorUpdate).toHaveBeenCalledWith({
      where: { id: COUNSELOR_ID },
      data: { title: 'Lead Coach' },
      select: { id: true },
    });
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 without writing user/profile when the own counselor row is missing', async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ fullName: 'Jordan Advisor' }) as never);
    expect(res.status).toBe(404);
    expect(h.userUpdate).not.toHaveBeenCalled();
    expect(h.counselorUpdate).not.toHaveBeenCalled();
  });
});
