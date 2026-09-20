import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(async () => false),
  getEmployerForUser: vi.fn(),
  getPartnerForUser: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    user: { update: vi.fn(async () => ({})) },
    employer: { update: vi.fn(async () => ({})) },
    partner: { update: vi.fn(async () => ({})) },
    userTourState: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  },
}));

import { POST } from '@/app/api/onboarding/reset/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const call = (body: unknown) =>
  (POST as unknown as (request: Request) => Promise<Response>)(
    new Request('http://localhost/api/onboarding/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/onboarding/reset clears UserTourState (wave 1 follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as any);
  });

  it('member reset clears the legacy timestamp AND the member.home tour rows for this user only', async () => {
    const res = await call({ portal: 'member' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ tourCompletedAt: null }) }),
    );
    expect(prisma.userTourState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tourKey: { in: ['member.home'] } },
    });
  });

  it('counselor reset has no legacy row and only forgets counselor.home', async () => {
    const res = await call({ portal: 'counselor' });
    expect(res.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.employer.update).not.toHaveBeenCalled();
    expect(prisma.partner.update).not.toHaveBeenCalled();
    expect(prisma.userTourState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tourKey: { in: ['counselor.home'] } },
    });
  });

  it('partner reset maps onto partner.home', async () => {
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: 'p1' } as any);
    const res = await call({ portal: 'partner' });
    expect(res.status).toBe(200);
    expect(prisma.partner.update).toHaveBeenCalled();
    expect(prisma.userTourState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', tourKey: { in: ['partner.home'] } },
    });
  });

  it('does not touch tour state when the portal context is forbidden', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue(null as any);
    const res = await call({ portal: 'employer' });
    expect(res.status).toBe(403);
    expect(prisma.userTourState.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects unknown portals', async () => {
    const res = await call({ portal: 'admin' });
    expect(res.status).toBe(400);
    expect(prisma.userTourState.deleteMany).not.toHaveBeenCalled();
  });
});
