import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  getEmployerForUser: vi.fn(async () => null),
  getPartnerForUser: vi.fn(async () => null),
  getProfileRole: vi.fn(async () => 'member'),
  getUserRoles: vi.fn(async () => []),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    userTourState: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    employer: { findUnique: vi.fn() },
    partner: { findUnique: vi.fn() },
    featureFlag: { findUnique: vi.fn() },
  },
}));

import { GET } from '@/app/api/tours/state/route';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser, getPartnerForUser, getProfileRole, getUserRoles } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

const req = () => new Request('http://localhost:3000/api/tours/state');
const call = () => (GET as unknown as (request: Request) => Promise<Response>)(req());

const row = (over: Partial<{ tourKey: string; version: number; status: string; lastStep: number }> = {}) => ({
  id: 'row1',
  userId: 'u1',
  tourKey: 'member.home',
  version: 2,
  status: 'COMPLETED',
  lastStep: 4,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-02T00:00:00Z'),
  ...over,
});

describe('GET /api/tours/state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(prisma.userTourState.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tourCompletedAt: null } as any);
    vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null as any);
    vi.mocked(getEmployerForUser).mockResolvedValue(null as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null as any);
    vi.mocked(getProfileRole).mockResolvedValue('member');
    vi.mocked(getUserRoles).mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(prisma.userTourState.findMany).not.toHaveBeenCalled();
  });

  it('returns the caller rows only, with the flag closed when no flag row exists', async () => {
    vi.mocked(prisma.userTourState.findMany).mockResolvedValue([row()] as any);
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(prisma.userTourState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(body.states).toEqual([
      {
        tourKey: 'member.home',
        version: 2,
        status: 'COMPLETED',
        lastStep: 4,
        updatedAt: '2026-09-02T00:00:00.000Z',
        legacy: false,
      },
    ]);
    expect(body.flags).toEqual({ guidedToursV2: false });
  });

  it('reads the legacy member tourCompletedAt as COMPLETED v1 so nobody is re-toured', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      tourCompletedAt: new Date('2026-04-05T12:00:00Z'),
    } as any);
    const res = await call();
    const body = await res.json();
    expect(body.states).toEqual([
      {
        tourKey: 'member.home',
        version: 1,
        status: 'COMPLETED',
        lastStep: 0,
        updatedAt: '2026-04-05T12:00:00.000Z',
        legacy: true,
      },
    ]);
  });

  it('a real row wins over the legacy timestamp for the same key', async () => {
    vi.mocked(prisma.userTourState.findMany).mockResolvedValue([row({ status: 'DISMISSED', lastStep: 1 })] as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tourCompletedAt: new Date('2026-04-05T12:00:00Z') } as any);
    const body = await (await call()).json();
    expect(body.states).toHaveLength(1);
    expect(body.states[0]).toMatchObject({ tourKey: 'member.home', status: 'DISMISSED', version: 2, legacy: false });
  });

  it('synthesises employer and partner legacy rows from their org timestamps', async () => {
    vi.mocked(getEmployerForUser).mockResolvedValue({ employerId: 'e1' } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue({ partnerId: 'p1' } as any);
    vi.mocked(prisma.employer.findUnique).mockResolvedValue({ tourCompletedAt: new Date('2026-05-01T00:00:00Z') } as any);
    vi.mocked(prisma.partner.findUnique).mockResolvedValue({ tourCompletedAt: null } as any);
    const body = await (await call()).json();
    expect(prisma.employer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' } }));
    expect(prisma.partner.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
    expect(body.states).toEqual([
      expect.objectContaining({ tourKey: 'employer.home', version: 1, status: 'COMPLETED', legacy: true }),
    ]);
  });

  it('skips the employer lookup when a real employer.home row already exists', async () => {
    vi.mocked(prisma.userTourState.findMany).mockResolvedValue([row({ tourKey: 'employer.home' })] as any);
    await call();
    expect(getEmployerForUser).not.toHaveBeenCalled();
    expect(getPartnerForUser).toHaveBeenCalledTimes(1);
  });

  it('drops rows whose status is outside the vocabulary', async () => {
    vi.mocked(prisma.userTourState.findMany).mockResolvedValue([row({ status: 'weird' })] as any);
    const body = await (await call()).json();
    expect(body.states).toEqual([]);
  });

  describe('guided_tours_v2 flag (isFlagEnabledForUser)', () => {
    const flag = (over: Record<string, unknown> = {}) => ({
      id: 'f1',
      key: 'guided_tours_v2',
      name: 'Guided tours v2',
      description: null,
      enabled: true,
      rolloutPercentage: 100,
      allowedRoles: [] as string[],
      ...over,
    });

    it('is open for a full rollout with no role restriction', async () => {
      vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(flag() as any);
      const body = await (await call()).json();
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({ where: { key: 'guided_tours_v2' } });
      expect(body.flags.guidedToursV2).toBe(true);
    });

    it('is closed when the flag row is disabled', async () => {
      vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(flag({ enabled: false }) as any);
      const body = await (await call()).json();
      expect(body.flags.guidedToursV2).toBe(false);
    });

    it('honours allowedRoles against the profile role + user_roles set', async () => {
      vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(flag({ allowedRoles: ['wap_staff'] }) as any);
      expect((await (await call()).json()).flags.guidedToursV2).toBe(false);
      vi.mocked(getUserRoles).mockResolvedValue(['wap_staff']);
      expect((await (await call()).json()).flags.guidedToursV2).toBe(true);
    });

    it('is closed at 0% rollout even when enabled', async () => {
      vi.mocked(prisma.featureFlag.findUnique).mockResolvedValue(flag({ rolloutPercentage: 0 }) as any);
      expect((await (await call()).json()).flags.guidedToursV2).toBe(false);
    });
  });

  it('returns 500 on db error', async () => {
    vi.mocked(prisma.userTourState.findMany).mockRejectedValue(new Error('boom'));
    const res = await call();
    expect(res.status).toBe(500);
  });
});
