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

vi.mock('@/lib/db/prisma', () => {
  const atRiskAlert = {
    findMany: vi.fn(),
    findFirst: vi.fn(async () => ({ id: 'alert-1' })),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
  const memberEvent = {
    findMany: vi.fn(),
    groupBy: vi.fn(),
  };
  const user = {
    findMany: vi.fn(),
    findUnique: vi.fn(async () => ({ organizationId: 'org-1' })),
  };
  const prismaMock: any = { atRiskAlert, memberEvent, user };
  prismaMock.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)));
  return { prisma: prismaMock };
});

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
  requireAdminOrCounselor: vi.fn(),
}));

vi.mock('@/lib/member/atRiskScoring', () => ({
  getRiskLevel: vi.fn((score: number) => {
    if (score >= 70) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }),
  THRESHOLDS: { CRITICAL: 70, HIGH: 50, MEDIUM: 30, LOW: 0 },
}));

vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

vi.mock('@/lib/member/persistedAtRisk', () => ({ loadPersistedAtRiskMembers: vi.fn() }));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(() => Promise.resolve()) }));

// ─── Imports after mocks ───
import { loadPersistedAtRiskMembers } from '@/lib/member/persistedAtRisk';
import { GET as getAtRiskMembers, PATCH as patchAtRiskMembers } from '@/app/api/admin/members/at-risk/route';
import { GET as getActivityTimeline } from '@/app/api/counselor/members/[memberId]/activity-timeline/route';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, requireAdminOrCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { auditLog } from '@/lib/audit';

// ─── Helpers ───
function makeRequest(url: string, init?: RequestInit): any {
  return new Request(url, init);
}

// ─── Tests: GET /api/admin/members/at-risk ───
describe('GET /api/admin/members/at-risk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'user-1' });
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(loadPersistedAtRiskMembers).mockResolvedValue({ total: 0, rows: [] });
  });

  it('returns distinct member totals and nullable real activity from the shared saved-case reader', async () => {
    vi.mocked(loadPersistedAtRiskMembers).mockResolvedValue({ total: 42, rows: [
      { userId: 'u1', alertId: 'alert-1', score: 75, lastActivityAt: null },
      { userId: 'u2', alertId: 'alert-2', score: 30, lastActivityAt: '2026-05-01T00:00:00Z' },
    ] } as Awaited<ReturnType<typeof loadPersistedAtRiskMembers>>);
    const res = await getAtRiskMembers(makeRequest('http://localhost/api/admin/members/at-risk?threshold=0&limit=20'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ count: 2, total: 42, threshold: 0 });
    expect(body.results[0]).toMatchObject({ score: 75, riskLevel: 'CRITICAL', lastActivityAt: null });
    expect(body.results[1].riskLevel).toBe('MEDIUM');
    expect(loadPersistedAtRiskMembers).toHaveBeenCalledWith({ organizationId: 'org-1' }, { threshold: 0, limit: 20, status: undefined });
  });

  it('keeps an explicit status filter, including resolved history', async () => {
    await getAtRiskMembers(makeRequest('http://localhost/api/admin/members/at-risk?status=resolved'));
    expect(loadPersistedAtRiskMembers).toHaveBeenCalledWith({ organizationId: 'org-1' }, { threshold: 50, limit: 20, status: 'resolved' });
  });

  it.each(['', '-1', '1000', 'NaN', '20junk', '1.5'])('keeps the existing default for invalid threshold %s', async threshold => {
    await getAtRiskMembers(makeRequest(`http://localhost/api/admin/members/at-risk?threshold=${threshold}`));
    expect(loadPersistedAtRiskMembers).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ threshold: 50 }));
  });

  it('requires current counselor assignment scope for a non-admin reader', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    await getAtRiskMembers(makeRequest('http://localhost/api/admin/members/at-risk?limit=-10'));
    expect(loadPersistedAtRiskMembers).toHaveBeenCalledWith({ organizationId: 'org-1', counselorUserId: 'user-1' }, { threshold: 50, limit: 1, status: undefined });
  });
});

// ─── Tests: PATCH /api/admin/members/at-risk ───
describe('PATCH /api/admin/members/at-risk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue({ id: 'alert-1', userId: 'member-1' } as any);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
  });

  function patchRequest(body: unknown) {
    return makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  it('lets the assigned counselor acknowledge and records the member in the audit log', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-1' } as any);
    vi.mocked(prisma.atRiskAlert.update).mockResolvedValue({ id: 'alert-1', status: 'acknowledged' } as any);

    const res = await patchAtRiskMembers(patchRequest({ alertId: 'alert-1', status: 'acknowledged' }));

    expect(res.status).toBe(200);
    expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith('counselor-1', 'member-1');
    expect(prisma.atRiskAlert.findFirst).toHaveBeenCalledWith({
      where: { id: 'alert-1', user: { organizationId: 'org-1' } },
      select: { id: true, userId: true },
    });
    expect(prisma.atRiskAlert.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'alert-1' },
      data: expect.objectContaining({ status: 'acknowledged', counselorId: 'counselor-1' }),
    }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'counselor-1',
      action: 'admin_at_risk_alert_update',
      targetId: 'alert-1',
      metadata: { status: 'acknowledged', memberId: 'member-1' },
    }));
  });

  it.each(['acknowledged', 'resolved', 'escalated'])(
    'returns 404 and changes nothing when a same-org counselor who is not assigned to the member tries %s',
    async (status) => {
      vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-2' } as any);
      vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

      const res = await patchAtRiskMembers(patchRequest({ alertId: 'alert-1', status }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Alert not found' });
      expect(assertStaffCanAccessMemberRecord).toHaveBeenCalledWith('counselor-2', 'member-1');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    },
  );

  it('returns 404 and changes nothing for an admin whose org does not own the alert', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'admin-org-2' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ organizationId: 'org-2' } as any);
    vi.mocked(prisma.atRiskAlert.findFirst).mockResolvedValue(null);

    const res = await patchAtRiskMembers(patchRequest({ alertId: 'alert-1', status: 'resolved' }));

    expect(res.status).toBe(404);
    expect(prisma.atRiskAlert.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'alert-1', user: { organizationId: 'org-2' } },
    }));
    expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('returns 401 without touching alerts when the caller is not signed in', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });

    const res = await patchAtRiskMembers(patchRequest({ alertId: 'alert-1', status: 'resolved' }));

    expect(res.status).toBe(401);
    expect(prisma.atRiskAlert.findFirst).not.toHaveBeenCalled();
    expect(prisma.atRiskAlert.update).not.toHaveBeenCalled();
  });

  it('acknowledges an alert', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-1' } as any);
    vi.mocked(prisma.atRiskAlert.update).mockResolvedValue({
      id: 'alert-1',
      status: 'acknowledged',
    } as any);

    const req = makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify({ alertId: 'alert-1', status: 'acknowledged' }),
    });
    const res = await patchAtRiskMembers(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prisma.atRiskAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'acknowledged',
          acknowledgedAt: expect.any(Date),
          counselorId: 'counselor-1',
        }),
      })
    );
  });

  it('resolves an alert', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-1' } as any);
    vi.mocked(prisma.atRiskAlert.update).mockResolvedValue({
      id: 'alert-1',
      status: 'resolved',
    } as any);

    const req = makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify({ alertId: 'alert-1', status: 'resolved' }),
    });
    const res = await patchAtRiskMembers(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prisma.atRiskAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        }),
      })
    );
  });

  it('escalates an alert', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-1' } as any);
    vi.mocked(prisma.atRiskAlert.update).mockResolvedValue({
      id: 'alert-1',
      status: 'escalated',
    } as any);

    const req = makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify({ alertId: 'alert-1', status: 'escalated' }),
    });
    const res = await patchAtRiskMembers(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(prisma.atRiskAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'escalated',
          escalatedAt: expect.any(Date),
          counselorId: 'counselor-1',
        }),
      })
    );
  });

  it('returns 400 for invalid status', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: true, userId: 'counselor-1' } as any);

    const req = makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify({ alertId: 'alert-1', status: 'invalid' }),
    });
    const res = await patchAtRiskMembers(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid alertId or status');
  });

  it('returns 403 when not admin or counselor', async () => {
    vi.mocked(requireAdminOrCounselor).mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });

    const req = makeRequest('http://localhost/api/admin/members/at-risk', {
      method: 'PATCH',
      body: JSON.stringify({ alertId: 'alert-1', status: 'acknowledged' }),
    });
    const res = await patchAtRiskMembers(req);
    expect(res.status).toBe(403);
  });
});

// ─── Tests: GET /api/counselor/members/:memberId/activity-timeline ───
describe('GET /api/counselor/members/:memberId/activity-timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns member events for authorized counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([
      {
        id: 'ev-1',
        eventName: 'page_view',
        sourcePage: '/dashboard',
        metadata: null,
        createdAt: new Date('2026-05-10T10:00:00Z'),
      },
      {
        id: 'ev-2',
        eventName: 'course_started',
        sourcePage: null,
        metadata: { courseSlug: 'intro-to-data' },
        createdAt: new Date('2026-05-09T14:00:00Z'),
      },
    ] as any);

    const req = makeRequest('http://localhost/api/counselor/members/member-1/activity-timeline?limit=10');
    const res = await getActivityTimeline(req, { params: Promise.resolve({ memberId: 'member-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].eventName).toBe('page_view');
    expect(prisma.memberEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'member-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    );
  });

  it('returns 401 when not logged in', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    const req = makeRequest('http://localhost/api/counselor/members/member-1/activity-timeline');
    const res = await getActivityTimeline(req, { params: Promise.resolve({ memberId: 'member-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when not counselor or admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'random-user' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(false);

    const req = makeRequest('http://localhost/api/counselor/members/member-1/activity-timeline');
    const res = await getActivityTimeline(req, { params: Promise.resolve({ memberId: 'member-1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 403 when counselor cannot access member', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(false);

    const req = makeRequest('http://localhost/api/counselor/members/member-1/activity-timeline');
    const res = await getActivityTimeline(req, { params: Promise.resolve({ memberId: 'member-1' }) });
    expect(res.status).toBe(403);
  });

  it('caps limit at 100', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'counselor-user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(prisma.memberEvent.findMany).mockResolvedValue([]);

    const req = makeRequest('http://localhost/api/counselor/members/member-1/activity-timeline?limit=500');
    await getActivityTimeline(req, { params: Promise.resolve({ memberId: 'member-1' }) });
    expect(prisma.memberEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      })
    );
  });
});
