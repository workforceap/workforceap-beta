// @vitest-environment node
/**
 * PATCH /api/member/application-onboarding writes programInterest onto the
 * caller's latest application (or creates one) and copies it onto User.
 * Unsigned is 401. Invalid JSON / empty interest are 400 without write.
 * Lookups and writes are by the caller userId — there is no application id
 * in the URL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationStatus } from '@prisma/client';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  applicationFindFirst: vi.fn(),
  applicationUpdate: vi.fn(),
  applicationCreate: vi.fn(),
  userUpdate: vi.fn(),
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
          application: {
            findFirst: typeof h.applicationFindFirst;
            update: typeof h.applicationUpdate;
            create: typeof h.applicationCreate;
          };
          user: { update: typeof h.userUpdate };
        }) => unknown,
      ) =>
        fn({
          application: {
            findFirst: h.applicationFindFirst,
            update: h.applicationUpdate,
            create: h.applicationCreate,
          },
          user: { update: h.userUpdate },
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

const { PATCH } = await import('@/app/api/member/application-onboarding/route');

const USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const APP_ID = '550e8400-e29b-41d4-a716-446655440010';

function patchRequest(body?: unknown) {
  return new Request('http://localhost/api/member/application-onboarding', {
    method: 'PATCH',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('PATCH /api/member/application-onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: USER_ID });
    h.applicationFindFirst.mockResolvedValue({ id: APP_ID });
    h.applicationUpdate.mockResolvedValue({ id: APP_ID });
    h.applicationCreate.mockResolvedValue({ id: 'new-app' });
    h.userUpdate.mockResolvedValue({ id: USER_ID });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 before parse when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ programInterest: 'IT Support' }) as never);
    expect(res.status).toBe(401);
    expect(h.applicationFindFirst).not.toHaveBeenCalled();
    expect(h.applicationUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON without writing', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/member/application-onboarding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.applicationFindFirst).not.toHaveBeenCalled();
  });

  it('returns 400 when programInterest is blank', async () => {
    const res = await PATCH(patchRequest({ programInterest: '' }) as never);
    expect(res.status).toBe(400);
    expect(h.applicationFindFirst).not.toHaveBeenCalled();
    expect(h.userUpdate).not.toHaveBeenCalled();
  });

  it('updates the caller latest application and copies interest onto User', async () => {
    const res = await PATCH(patchRequest({ programInterest: 'IT Support<script>' }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.applicationFindFirst).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    expect(h.applicationUpdate).toHaveBeenCalledWith({
      where: { id: APP_ID },
      data: { programInterest: 'IT Support<script>' },
    });
    expect(h.applicationCreate).not.toHaveBeenCalled();
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { programInterest: 'IT Support<script>' },
    });
  });

  it('creates a PENDING application for the caller when none exists', async () => {
    h.applicationFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ programInterest: 'Cybersecurity' }) as never);
    expect(res.status).toBe(200);
    expect(h.applicationUpdate).not.toHaveBeenCalled();
    expect(h.applicationCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        programInterest: 'Cybersecurity',
        status: ApplicationStatus.PENDING,
        submittedAt: expect.any(Date),
      },
    });
    expect(h.userUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { programInterest: 'Cybersecurity' },
    });
  });

  it('returns 500 when the write throws', async () => {
    h.applicationUpdate.mockRejectedValue(new Error('db down'));
    const res = await PATCH(patchRequest({ programInterest: 'IT Support' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
