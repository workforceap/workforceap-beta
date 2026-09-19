import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(),
      getAll: vi.fn(() => []),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/ensureUser', () => ({ ensureUserInDb: vi.fn() }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    user: {
      findUnique: vi.fn(async () => null),
    },
    goal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// ─── Imports after mocks ───
import { GET as goalsGET, POST as goalsPOST } from '@/app/api/member/goals/route';
import { PATCH as goalPATCH, DELETE as goalDELETE } from '@/app/api/member/goals/[id]/route';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { trackEvent } from '@/lib/events/track';

const makeRequest = (body?: Record<string, unknown>) =>
  new Request('http://localhost:3000/api/member/goals', {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as import('next/server').NextRequest;

describe('GET /api/member/goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await goalsGET(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns goals for authenticated member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { id: 'g1', userId: 'user-123', goalType: 'skill', title: 'Learn TypeScript', status: 'ACTIVE', createdAt: new Date('2026-01-01') },
      { id: 'g2', userId: 'user-123', goalType: 'job', title: 'Get a job', status: 'COMPLETED', createdAt: new Date('2026-02-01') },
    ] as any);

    const res = await goalsGET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goals).toHaveLength(2);
    expect(body.goals[0].title).toBe('Learn TypeScript');
    expect(body.goals[1].status).toBe('COMPLETED');
  });

  it('returns empty array when no goals exist', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findMany).mockResolvedValue([]);

    const res = await goalsGET(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goals).toEqual([]);
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findMany).mockRejectedValue(new Error('db down'));

    const res = await goalsGET(new Request('http://localhost'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load goals' });
  });
});

describe('POST /api/member/goals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await goalsPOST(makeRequest({ goalType: 'skill', title: 'Learn React' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await goalsPOST(
      new Request('http://localhost:3000/api/member/goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 for missing goalType', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await goalsPOST(makeRequest({ title: 'Learn React' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for missing title', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    const res = await goalsPOST(makeRequest({ goalType: 'skill' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when at active goal limit', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.count).mockResolvedValue(3);

    const res = await goalsPOST(makeRequest({ goalType: 'skill', title: 'Learn React' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'You can have at most 3 active goals' });
  });

  it('creates goal successfully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.count).mockResolvedValue(1);
    vi.mocked(prisma.goal.create).mockResolvedValue({
      id: 'g-new',
      userId: 'user-123',
      goalType: 'skill',
      title: 'Learn React',
      description: null,
      targetMetricType: null,
      targetMetricValue: null,
      targetDate: null,
      status: 'ACTIVE',
      createdAt: new Date('2026-05-01'),
    } as any);

    const res = await goalsPOST(makeRequest({ goalType: 'skill', title: 'Learn React' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goal.title).toBe('Learn React');
    expect(body.goal.goalType).toBe('skill');
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'goal_created',
        entityType: 'goal',
        entityId: 'g-new',
      })
    );
  });

  it('creates goal with optional fields', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.count).mockResolvedValue(0);
    vi.mocked(prisma.goal.create).mockResolvedValue({
      id: 'g-new',
      userId: 'user-123',
      goalType: 'skill',
      title: 'Learn React',
      description: 'Master hooks and context',
      targetMetricType: 'hours',
      targetMetricValue: 100,
      targetDate: new Date('2026-12-31'),
      status: 'ACTIVE',
      createdAt: new Date('2026-05-01'),
    } as any);

    const res = await goalsPOST(
      makeRequest({
        goalType: 'skill',
        title: 'Learn React',
        description: 'Master hooks and context',
        targetMetricType: 'hours',
        targetMetricValue: 100,
        targetDate: '2026-12-31T00:00:00Z',
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goal.description).toBe('Master hooks and context');
    expect(body.goal.targetMetricValue).toBe(100);
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.count).mockResolvedValue(1);
    vi.mocked(prisma.goal.create).mockRejectedValue(new Error('db write failed'));

    const res = await goalsPOST(makeRequest({ goalType: 'skill', title: 'Learn React' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to create goal' });
  });
});

describe('PATCH /api/member/goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when goal not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue(null);

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123' } as any);

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('updates title successfully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123', title: 'Old' } as any);
    vi.mocked(prisma.goal.update).mockResolvedValue({ id: 'g1', userId: 'user-123', title: 'Updated Title' } as any);

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goal.title).toBe('Updated Title');
  });

  it('marks goal as completed and tracks event', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123', status: 'ACTIVE' } as any);
    vi.mocked(prisma.goal.update).mockResolvedValue({ id: 'g1', userId: 'user-123', status: 'COMPLETED', completedAt: new Date() } as any);

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goal.status).toBe('COMPLETED');
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'goal_completed',
        entityType: 'goal',
        entityId: 'g1',
      })
    );
  });

  it('tracks goal_updated for non-completion changes', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123' } as any);
    vi.mocked(prisma.goal.update).mockResolvedValue({ id: 'g1', userId: 'user-123', description: 'New desc' } as any);

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'New desc' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(200);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        eventName: 'goal_updated',
        entityType: 'goal',
        entityId: 'g1',
      })
    );
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123' } as any);
    vi.mocked(prisma.goal.update).mockRejectedValue(new Error('db down'));

    const res = await goalPATCH(
      new Request('http://localhost:3000/api/member/goals/g1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' }),
      }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('DELETE /api/member/goals/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await goalDELETE(
      new Request('http://localhost:3000/api/member/goals/g1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 when goal not found', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue(null);

    const res = await goalDELETE(
      new Request('http://localhost:3000/api/member/goals/g1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('deletes goal successfully', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123' } as any);
    vi.mocked(prisma.goal.delete).mockResolvedValue({ id: 'g1' } as any);

    const res = await goalDELETE(
      new Request('http://localhost:3000/api/member/goals/g1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(prisma.goal.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('returns 500 on db error', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-123', email: 'jane@example.com' } as any);
    vi.mocked(prisma.goal.findFirst).mockResolvedValue({ id: 'g1', userId: 'user-123' } as any);
    vi.mocked(prisma.goal.delete).mockRejectedValue(new Error('db down'));

    const res = await goalDELETE(
      new Request('http://localhost:3000/api/member/goals/g1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'g1' }) }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });
});
