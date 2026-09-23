import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
  // Route now defers side effects via next/server's after().
  after: (fn: () => unknown) => { void Promise.resolve().then(fn); },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn() }));
vi.mock('@/lib/notifications/partner-notify', () => ({
  sendPartnerMilestoneEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: vi.fn(() => Promise.resolve()) }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    userCertification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { GET, POST } from '@/app/api/member/certifications/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { awardPoints } from '@/lib/member/points';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const postReq = (body: unknown) =>
  new Request('http://localhost:3000/api/member/certifications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('GET /api/member/certifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns user certifications for authenticated user', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.findMany).mockResolvedValue([
      { certName: 'AWS', earnedAt: new Date('2026-01-01'), status: 'pending' } as any,
    ]);
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certifications).toHaveLength(1);
    expect(body.certifications[0].certName).toBe('AWS');
    // WAP-20: the member can see that a self-report is awaiting review.
    expect(body.certifications[0].status).toBe('pending');
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.findMany).mockRejectedValue(new Error('boom'));
    const res = await GET(new Request('http://localhost'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/member/certifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the member has no certification of that name yet.
    vi.mocked(prisma.userCertification.findUnique).mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await POST(postReq({ certName: 'AWS', earned: true }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    const res = await POST(postReq('not-json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing certName', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    const res = await POST(postReq({ earned: true }));
    expect(res.status).toBe(400);
  });

  it('creates a self-reported certification as pending and fires no credential effects', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.upsert).mockResolvedValue({ status: 'pending' } as any);

    const res = await POST(postReq({ certName: 'AWS Cloud Practitioner', earned: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'pending' });
    expect(prisma.userCertification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 'u1', certName: 'AWS Cloud Practitioner', status: 'pending', submittedAt: expect.any(Date) }),
      }),
    );
    // WAP-20: a typed-in name is not a verified credential — the lifecycle
    // event, points and partner milestone fire from the admin review route.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trackEvent).not.toHaveBeenCalled();
    expect(awardPoints).not.toHaveBeenCalled();
    expect(sendPartnerMilestoneEmail).not.toHaveBeenCalled();
  });

  it.each(['pending', 'rejected'] as const)(
    're-adding a %s certification refreshes only the date, not its review status',
    async (status) => {
      vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
      vi.mocked(prisma.userCertification.findUnique).mockResolvedValue({
        id: 'cert-1', certName: 'AWS', status, earnedAt: new Date('2026-01-01T00:00:00.000Z'),
      } as any);
      vi.mocked(prisma.userCertification.updateMany).mockResolvedValue({ count: 1 } as any);

      const res = await POST(postReq({ certName: 'AWS', earned: true, earnedAt: '2026-02-01T00:00:00.000Z' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, status });
      expect(prisma.userCertification.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_certName: { userId: 'u1', certName: 'AWS' } } }),
      );
      // The write is guarded so a row approved in the meantime is never re-dated.
      expect(prisma.userCertification.updateMany).toHaveBeenCalledWith({
        where: { id: 'cert-1', userId: 'u1', status: { not: 'approved' } },
        data: { earnedAt: new Date('2026-02-01T00:00:00.000Z') },
      });
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  // Mike, 2026-09-23 02:39 UTC: "verified cert stays verified". Re-adding a
  // verified (`approved`) certificate with a new manual date must not re-date
  // it; the attempt is recorded in the audit log instead.
  it('re-adding a verified certification with a new date changes nothing and is audited', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.findUnique).mockResolvedValue({
      id: 'cert-1', certName: 'AWS', status: 'approved', earnedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    const res = await POST(postReq({ certName: 'AWS', earned: true, earnedAt: '2026-02-01T00:00:00.000Z' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'approved', verifiedUnchanged: true });
    expect(prisma.userCertification.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_certName: { userId: 'u1', certName: 'AWS' } } }),
    );
    expect(prisma.userCertification.upsert).not.toHaveBeenCalled();
    expect(prisma.userCertification.updateMany).not.toHaveBeenCalled();

    expect(auditLog).toHaveBeenCalledWith({
      actorUserId: 'u1',
      action: 'member.certification.redate_blocked_verified',
      targetType: 'user_certification',
      targetId: 'cert-1',
      metadata: {
        certName: 'AWS',
        status: 'approved',
        keptEarnedAt: '2026-01-01T00:00:00.000Z',
        requestedEarnedAt: '2026-02-01T00:00:00.000Z',
      },
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 'u1', role: 'member' },
        verb: 'update',
        object: { type: 'UserCertification', id: 'cert-1' },
        result: expect.objectContaining({
          success: false,
          extensions: expect.objectContaining({ field: 'earnedAt', status: 'approved', statusKept: true }),
        }),
      }),
    );
  });

  it('re-adding a verified certification with its own date is a quiet no-op', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.findUnique).mockResolvedValue({
      id: 'cert-1', certName: 'AWS', status: 'approved', earnedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as any);

    const res = await POST(postReq({ certName: 'AWS', earned: true, earnedAt: '2026-01-01T00:00:00.000Z' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, status: 'approved', verifiedUnchanged: true });
    expect(prisma.userCertification.upsert).not.toHaveBeenCalled();
    expect(prisma.userCertification.updateMany).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('deletes certification when earned=false', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.deleteMany).mockResolvedValue({ count: 1 } as any);

    const res = await POST(postReq({ certName: 'AWS', earned: false }));
    expect(res.status).toBe(200);
    expect(prisma.userCertification.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', certName: 'AWS' },
    });
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    vi.mocked(prisma.userCertification.upsert).mockRejectedValue(new Error('db down'));
    const res = await POST(postReq({ certName: 'AWS', earned: true }));
    expect(res.status).toBe(500);
  });
});
