// @vitest-environment node
/**
 * C04: both counselor bulk follow-up routes (Priority Queue ->
 * /api/counselor/bulk-followup, Inbox Zero -> /api/counselor/inbox-zero/bulk
 * action follow_up) must
 *   1. give every member who is actually sent a message exactly one in-app
 *      notification, as the single-member counselor message route already does;
 *   2. skip a member who already received the same template recently, so a
 *      double submit, a timed-out retry or a second counselor does not post the
 *      same template twice. A skip is not a failure.
 */
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
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({
  isAdmin: vi.fn(async () => false),
  isCounselor: vi.fn(async () => true),
  isSuperAdmin: vi.fn(async () => false),
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/tenant/organization', () => ({
  getSubjectOrganizationId: vi.fn(async () => 'org-1'),
  getActorOrganizationId: vi.fn(async () => 'org-1'),
}));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({ assertStaffCanAccessMemberRecord: vi.fn() }));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(),
  assertStaffCanPost: vi.fn(),
  normalizeMessageBody: vi.fn((body: string) => ({ ok: true, body })),
}));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/counselor/inboxZeroAudit', () => ({ logInboxZeroBulkAuditEvent: vi.fn(async () => undefined) }));

const calls = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('@/lib/db/prisma', () => {
  const prisma: any = {
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() },
    memberEvent: { create: vi.fn(), findFirst: vi.fn() },
    $executeRaw: vi.fn(),
  };
  prisma.$transaction = vi.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  return { prisma };
});
vi.mock('@/lib/tenant/withTenantScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return { withTenantScope: (_orgId: string, fn: (d: unknown) => unknown) => fn(prisma) };
});

import { getUser } from '@/lib/auth/server';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { assertStaffCanPost, getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { createNotification } from '@/lib/notifications/create';
import { prisma } from '@/lib/db/prisma';
import { POST as bulkFollowupPOST } from '@/app/api/counselor/bulk-followup/route';
import { POST as inboxZeroBulkPOST } from '@/app/api/counselor/inbox-zero/bulk/route';

const COUNSELOR_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '33333333-3333-4333-8333-333333333333';

const db = prisma as unknown as {
  user: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  message: { create: ReturnType<typeof vi.fn> };
  memberEvent: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
};

function post(url: string, body: unknown) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const sendPriorityQueue = (memberIds: string[]) =>
  bulkFollowupPOST(post('/api/counselor/bulk-followup', { memberIds, templateId: 'check_in' }));
const sendInboxZero = (memberIds: string[]) =>
  inboxZeroBulkPOST(post('/api/counselor/inbox-zero/bulk', { action: 'follow_up', memberIds, templateId: 'check_in' }));

beforeEach(() => {
  vi.clearAllMocks();
  calls.order = [];
  vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR_ID, email: 'c@example.test' } as never);
  vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
  vi.mocked(getOrCreateMemberCounselorThread).mockImplementation(
    async (memberId: string) => ({ id: `thread-${memberId}`, counselorUserId: COUNSELOR_ID }) as never,
  );
  vi.mocked(assertStaffCanPost).mockResolvedValue({ id: 'thread' } as never);
  db.user.findMany.mockResolvedValue([
    { id: MEMBER_A, fullName: 'Ana Member', email: 'a@example.test', enrolledProgram: null },
    { id: MEMBER_B, fullName: 'Ben Member', email: 'b@example.test', enrolledProgram: null },
  ]);
  db.user.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    fullName: 'Some Member',
    enrolledProgram: null,
  }));
  db.$executeRaw.mockImplementation(async () => {
    calls.order.push('lock');
    return 1;
  });
  db.memberEvent.findFirst.mockImplementation(async () => {
    calls.order.push('repeat-check');
    return null;
  });
  db.message.create.mockImplementation(async ({ data }: { data: { threadId: string } }) => {
    calls.order.push('message');
    return { id: `msg-${data.threadId}` };
  });
  db.memberEvent.create.mockResolvedValue({});
});

describe.each([
  ['POST /api/counselor/bulk-followup', sendPriorityQueue],
  ['POST /api/counselor/inbox-zero/bulk follow_up', sendInboxZero],
] as const)('%s', (_name, send) => {
  it('creates exactly one in-app notification per member sent', async () => {
    const res = await send([MEMBER_A, MEMBER_B, MEMBER_A]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(2);

    expect(createNotification).toHaveBeenCalledTimes(2);
    for (const memberId of [MEMBER_A, MEMBER_B]) {
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: memberId,
          type: 'message',
          title: 'New message from your advisor',
          data: expect.objectContaining({ threadId: `thread-${memberId}`, link: '/dashboard/messages' }),
          notifyOperator: false,
        }),
      );
    }
  });

  it('does not notify a member the counselor may not access', async () => {
    vi.mocked(assertStaffCanAccessMemberRecord).mockImplementation(async (_actor, memberId) => memberId === MEMBER_A);
    const res = await send([MEMBER_A, MEMBER_B]);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: MEMBER_A }));
  });

  it('skips a member who already received the same template recently (no message, no notification)', async () => {
    db.memberEvent.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) => {
      calls.order.push('repeat-check');
      return where.userId === MEMBER_B ? { createdAt: new Date() } : null;
    });

    const res = await send([MEMBER_A, MEMBER_B]);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.sent).toBe(1);
    expect(json.skipped).toBe(1);
    expect(json.failed).toBe(0);
    const skippedRow = json.results.find((r: { memberId: string }) => r.memberId === MEMBER_B);
    expect(skippedRow).toMatchObject({ ok: false, skipped: true, error: 'already_sent_recently' });

    expect(db.message.create).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ userId: MEMBER_B }));
  });

  it('checks for the repeat under a lock, inside the send transaction, before writing the message', async () => {
    await send([MEMBER_A]);
    expect(calls.order).toEqual(['lock', 'repeat-check', 'message']);
    expect(db.memberEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: MEMBER_A,
          eventName: { in: ['counselor_bulk_followup_sent', 'counselor_inbox_zero_follow_up_sent'] },
          metadata: { path: ['templateId'], equals: 'check_in' },
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });
});
