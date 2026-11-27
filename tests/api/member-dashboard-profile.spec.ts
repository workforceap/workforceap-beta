// @vitest-environment node
/**
 * PATCH /api/member/dashboard-profile writes the caller's name, contact,
 * and barrier fields. Unsigned is 401. Invalid JSON / short name / short
 * phone / bad ZIP are 400 without write. LinkedIn is currently stored as
 * typed, including javascript: (pinned). Writes are by caller userId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  userUpdate: vi.fn(),
  profileUpsert: vi.fn(),
  invalidateMemberState: vi.fn(),
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
          user: { update: typeof h.userUpdate };
          profile: { upsert: typeof h.profileUpsert };
        }) => unknown,
      ) => fn({ user: { update: h.userUpdate }, profile: { upsert: h.profileUpsert } }),
    ),
  },
}));

vi.mock('@/lib/member/getMemberState', () => ({
  invalidateMemberState: h.invalidateMemberState,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  logAuditEvent: h.logAuditEvent,
}));

const { PATCH } = await import('@/app/api/member/dashboard-profile/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';

const validBody = {
  firstName: 'Pat',
  lastName: 'Rivera',
  phone: '5125550100',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  linkedin: 'https://www.linkedin.com/in/pat',
  bio: 'Help desk specialist.',
};

function patchRequest(body?: unknown) {
  return new Request('http://localhost/api/member/dashboard-profile', {
    method: 'PATCH',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('PATCH /api/member/dashboard-profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.userUpdate.mockResolvedValue({ id: USER_ID });
    h.profileUpsert.mockResolvedValue({ userId: USER_ID });
    h.invalidateMemberState.mockResolvedValue(undefined);
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest(validBody) as never);
    expect(res.status).toBe(401);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/member/dashboard-profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when last name is missing', async () => {
    const res = await PATCH(patchRequest({ ...validBody, lastName: '' }) as never);
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when phone has fewer than 10 digits', async () => {
    const res = await PATCH(patchRequest({ ...validBody, phone: '512' }) as never);
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when ZIP is invalid', async () => {
    const res = await PATCH(patchRequest({ ...validBody, zip: '!!' }) as never);
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('writes the caller userId and currently stores a javascript: LinkedIn URL (pinned)', async () => {
    const res = await PATCH(
      patchRequest({
        ...validBody,
        linkedin: 'javascript:alert(1)',
        hasEmploymentBarrier: true,
        barrierTypes: ['justice_involved', 'housing_instability'],
        employmentStatusAtEnroll: 'unemployed',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { fullName: 'Pat Rivera', phone: '5125550100' },
    });
    expect(h.profileUpsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: expect.objectContaining({
        userId: USER_ID,
        profileLinkedin: 'javascript:alert(1)',
        hasEmploymentBarrier: true,
        barrierTypes: ['justice_involved', 'housing_instability'],
        employmentStatusAtEnroll: 'unemployed',
      }),
      update: expect.objectContaining({
        profileLinkedin: 'javascript:alert(1)',
        hasEmploymentBarrier: true,
        barrierTypes: ['justice_involved', 'housing_instability'],
        employmentStatusAtEnroll: 'unemployed',
      }),
    });
    expect(h.invalidateMemberState).toHaveBeenCalledWith(USER_ID);
  });

  it('returns 400 for an unknown barrier type without writing', async () => {
    const res = await PATCH(
      patchRequest({ ...validBody, barrierTypes: ['not_a_barrier'] }) as never,
    );
    expect(res.status).toBe(400);
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 when the write throws', async () => {
    h.userUpdate.mockRejectedValue(new Error('db down'));
    const res = await PATCH(patchRequest(validBody) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
