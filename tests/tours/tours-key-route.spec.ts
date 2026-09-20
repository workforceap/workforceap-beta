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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    userTourState: { upsert: vi.fn() },
  },
}));

vi.mock('@/lib/events/track', () => ({
  trackEvent: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/tours/[tourKey]/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';
import { EVENT_NAMES } from '@/lib/events/names';

const req = (body: unknown) =>
  new Request('http://localhost:3000/api/tours/member.home', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const call = (body: unknown, tourKey = 'member.home') =>
  (POST as unknown as (request: Request, context: { params: Promise<{ tourKey: string }> }) => Promise<Response>)(
    req(body),
    { params: Promise.resolve({ tourKey }) },
  );

const upserted = (over: Record<string, unknown> = {}) => ({
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

describe('POST /api/tours/[tourKey]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: 'u1' } as any);
    vi.mocked(prisma.userTourState.upsert).mockResolvedValue(upserted() as any);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await call({ version: 2, status: 'COMPLETED', lastStep: 4 });
    expect(res.status).toBe(401);
    expect(prisma.userTourState.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 for a key that is not in the registry and writes nothing', async () => {
    const res = await call({ version: 2, status: 'COMPLETED', lastStep: 4 }, 'counselor.nope');
    expect(res.status).toBe(404);
    expect(prisma.userTourState.upsert).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await call('not-json');
    expect(res.status).toBe(400);
  });

  const invalidBodies: Array<[Record<string, unknown>, string]> = [
    [{ version: 2, status: 'FINISHED', lastStep: 0 }, 'unknown status'],
    [{ version: 0, status: 'STARTED', lastStep: 0 }, 'version below 1'],
    [{ version: 2, status: 'STARTED', lastStep: -1 }, 'negative lastStep'],
    [{ version: 1.5, status: 'STARTED', lastStep: 0 }, 'fractional version'],
    [{ status: 'STARTED' }, 'missing version'],
  ];
  it.each(invalidBodies)('returns 400 for %j (%s)', async (body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(prisma.userTourState.upsert).not.toHaveBeenCalled();
  });

  it('upserts the caller row by (userId, tourKey) and writes tour_completed server-side', async () => {
    const res = await call({ version: 2, status: 'COMPLETED', lastStep: 4, sourcePage: '/dashboard' });
    expect(res.status).toBe(200);
    expect(prisma.userTourState.upsert).toHaveBeenCalledWith({
      where: { userId_tourKey: { userId: 'u1', tourKey: 'member.home' } },
      create: { userId: 'u1', tourKey: 'member.home', version: 2, status: 'COMPLETED', lastStep: 4 },
      update: { version: 2, status: 'COMPLETED', lastStep: 4 },
    });
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        eventName: 'tour_completed',
        entityType: 'tour',
        entityId: 'member.home',
        sourcePage: '/dashboard',
        metadata: expect.objectContaining({ tourKey: 'member.home', version: 2, lastStep: 4, role: 'member' }),
      }),
    );
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      state: { tourKey: 'member.home', version: 2, status: 'COMPLETED', lastStep: 4, updatedAt: '2026-09-02T00:00:00.000Z' },
    });
  });

  it('defaults lastStep to 0 and sourcePage to the registry route', async () => {
    vi.mocked(prisma.userTourState.upsert).mockResolvedValue(upserted({ status: 'STARTED', lastStep: 0 }) as any);
    const res = await call({ version: 2, status: 'STARTED' }, 'employer.home');
    expect(res.status).toBe(200);
    expect(prisma.userTourState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ tourKey: 'employer.home', lastStep: 0 }) }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'tour_started', entityId: 'employer.home', sourcePage: '/employer' }),
    );
  });

  it('maps DISMISSED to tour_dismissed', async () => {
    await call({ version: 2, status: 'DISMISSED', lastStep: 1 }, 'partner.home');
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'tour_dismissed', entityId: 'partner.home' }));
  });

  it('uses names that exist in the member-event vocabulary', () => {
    for (const name of ['tour_started', 'tour_completed', 'tour_dismissed']) {
      expect(EVENT_NAMES).toContain(name);
    }
  });

  it('returns 500 on db error', async () => {
    vi.mocked(prisma.userTourState.upsert).mockRejectedValue(new Error('boom'));
    const res = await call({ version: 2, status: 'COMPLETED', lastStep: 4 });
    expect(res.status).toBe(500);
  });
});
