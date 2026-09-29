import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('next/server', () => ({
  NextRequest: class extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  },
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
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendCounselorAssignedEmail: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn().mockResolvedValue({
    id: 'thread-1',
    memberId: 'member-1',
    counselorUserId: null,
  }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(),
  createBulkNotifications: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(async () => 'org-1'),
  getDefaultOrganizationId: vi.fn(async () => 'org-1'),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    counselor: {
      findFirst: vi.fn(),
    },
    counselorAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: 'assign-1' }),
    },
    $transaction: vi.fn(async (arg: any) => {
      const { prisma } = await import('@/lib/db/prisma');
      return typeof arg === 'function' ? arg(prisma) : Promise.all(arg);
    }),
    messageThread: {
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    },
  },
}));

// ─── Imports after mocks ───
import { POST as assignCounselor } from '@/app/api/admin/members/[id]/counselor/route';
import { NextRequest } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { createNotification } from '@/lib/notifications/create';
import { sendCounselorAssignedEmail } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

const UUIDS = {
  admin: '550e8400-e29b-41d4-a716-446655440001',
  member: '550e8400-e29b-41d4-a716-446655440002',
  counselorUser: '550e8400-e29b-41d4-a716-446655440003',
  counselor: '550e8400-e29b-41d4-a716-446655440004',
  previousCounselorUser: '550e8400-e29b-41d4-a716-446655440006',
  thread: '550e8400-e29b-41d4-a716-446655440005',
};

const makeRequest = (id: string, body: unknown) =>
  new NextRequest(`http://localhost:3000/api/admin/members/${id}/counselor`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('POST /api/admin/members/[id]/counselor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates task_assigned notification when assigning a counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin, fullName: 'Admin Bob' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: UUIDS.member,
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      organizationId: 'org-1',
    } as any);

    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: UUIDS.counselor,
      userId: UUIDS.counselorUser,
      active: true,
      user: { id: UUIDS.counselorUser, fullName: 'Counselor Alice' },
    } as any);

    vi.mocked(prisma.counselorAssignment.findUnique).mockResolvedValue(null);

    const res = await assignCounselor(
      makeRequest(UUIDS.member, { counselorUserId: UUIDS.counselorUser }),
      { params: Promise.resolve({ id: UUIDS.member }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.counselorName).toBe('Counselor Alice');
    expect(body.notificationEmailSent).toBe(true);

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UUIDS.member,
        type: 'task_assigned',
        title: 'You have a new advisor',
        body: 'Counselor Alice has been assigned as your career advisor.',
        data: expect.objectContaining({
          counselorId: UUIDS.counselor,
          counselorUserId: UUIDS.counselorUser,
          threadId: 'thread-1',
        }),
      })
    );
  });

  it('returns committed success with a warning when the assignment email fails', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.admin, fullName: 'Admin Bob' } as any);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: UUIDS.member,
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      organizationId: 'org-1',
    } as any);
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: UUIDS.counselor,
      userId: UUIDS.counselorUser,
      active: true,
      user: { id: UUIDS.counselorUser, fullName: 'Counselor Alice' },
    } as any);
    vi.mocked(prisma.counselorAssignment.findUnique).mockResolvedValue(null);
    vi.mocked(sendCounselorAssignedEmail).mockResolvedValueOnce({ ok: false, error: 'provider down' });

    const res = await assignCounselor(
      makeRequest(UUIDS.member, { counselorUserId: UUIDS.counselorUser }),
      { params: Promise.resolve({ id: UUIDS.member }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.notificationEmailSent).toBe(false);
    expect(body.warning).toMatch(/assigned.*email was not sent/i);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await assignCounselor(
      makeRequest(UUIDS.member, { counselorUserId: UUIDS.counselorUser }),
      { params: Promise.resolve({ id: UUIDS.member }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(isAdmin).mockResolvedValue(false);
    const res = await assignCounselor(
      makeRequest(UUIDS.member, { counselorUserId: UUIDS.counselorUser }),
      { params: Promise.resolve({ id: UUIDS.member }) }
    );
    expect(res.status).toBe(403);
  });
  describe('staff handoff to a new counselor', () => {
    const arrange = (opts: { actorId?: string; previousCounselorUserId: string | null }) => {
      vi.mocked(getUser).mockResolvedValue({ id: opts.actorId ?? UUIDS.admin, fullName: 'Admin Bob' } as any);
      vi.mocked(isAdmin).mockResolvedValue(true);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: UUIDS.member, email: 'jane@example.com', fullName: 'Jane Doe', organizationId: 'org-1',
      } as any);
      vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
        id: UUIDS.counselor, userId: UUIDS.counselorUser, active: true,
        user: { id: UUIDS.counselorUser, fullName: 'Counselor Alice' },
      } as any);
      vi.mocked(prisma.counselorAssignment.findUnique).mockResolvedValue(null);
      vi.mocked((prisma.counselorAssignment as any).findFirst).mockResolvedValue(
        opts.previousCounselorUserId
          ? { counselor: { userId: opts.previousCounselorUserId, user: { fullName: 'Counselor Previous' } } }
          : null,
      );
    };
    const post = () => assignCounselor(
      makeRequest(UUIDS.member, { counselorUserId: UUIDS.counselorUser }),
      { params: Promise.resolve({ id: UUIDS.member }) },
    );
    const counselorNotifications = () => vi.mocked(createNotification).mock.calls
      .map(([input]) => input)
      .filter((input) => input.userId !== UUIDS.member);

    it('audits who the member moved from and notifies the receiving counselor once', async () => {
      arrange({ previousCounselorUserId: UUIDS.previousCounselorUser });

      const res = await post();
      expect(res.status).toBe(200);

      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: 'admin_member_counselor_assign',
        metadata: expect.objectContaining({
          counselorUserId: UUIDS.counselorUser,
          previousCounselorUserId: UUIDS.previousCounselorUser,
          previousCounselorName: 'Counselor Previous',
        }),
      }));
      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({
          extensions: expect.objectContaining({
            counselorUserId: UUIDS.counselorUser,
            previousCounselorUserId: UUIDS.previousCounselorUser,
          }),
        }),
      }));
      expect(counselorNotifications()).toEqual([
        expect.objectContaining({
          userId: UUIDS.counselorUser,
          type: 'task_assigned',
          title: 'A member was assigned to you',
          data: expect.objectContaining({ memberId: UUIDS.member, link: `/counselor/students/${UUIDS.member}` }),
        }),
      ]);
    });

    it('records a null previous counselor for a first assignment', async () => {
      arrange({ previousCounselorUserId: null });
      await post();
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ previousCounselorUserId: null }),
      }));
      expect(counselorNotifications()).toHaveLength(1);
    });

    it('does not notify the counselor when the member already had them', async () => {
      arrange({ previousCounselorUserId: UUIDS.counselorUser });
      const res = await post();
      expect(res.status).toBe(200);
      expect(counselorNotifications()).toEqual([]);
    });

    it('does not notify the counselor when they assigned the member to themselves', async () => {
      arrange({ actorId: UUIDS.counselorUser, previousCounselorUserId: UUIDS.previousCounselorUser });
      const res = await post();
      expect(res.status).toBe(200);
      expect(counselorNotifications()).toEqual([]);
    });

    it('keeps the committed assignment successful when the counselor notification fails', async () => {
      arrange({ previousCounselorUserId: UUIDS.previousCounselorUser });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(createNotification).mockImplementation(async (input: any) => {
        if (input.userId === UUIDS.counselorUser) throw new Error('Synthetic notification failure');
      });
      const res = await post();
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      vi.mocked(createNotification).mockReset();
    });
  });
});
