import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Staff replies sent through the admin routes must create the member's in-app
 * notification exactly like the counselor route does. Before this, an admin
 * reply produced a message row and nothing else: no bell, no push, no badge
 * until the member happened to open Messages.
 */
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
    after: (fn: () => unknown) => void fn(),
  };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'staff-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => true), isSuperAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined), auditRequestMeta: vi.fn(() => ({})) }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));

const db = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  threadUpdate: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    user: { findFirst: db.userFindFirst },
    message: { create: db.messageCreate },
    messageThread: { update: db.threadUpdate },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(async (memberId: string) => ({ id: 'thread-1', memberId, counselorUserId: null })),
  assertStaffCanAccessThread: vi.fn(async () => true),
  assertStaffCanPost: vi.fn(async () => true),
  compactStringIds: (ids: Array<string | null>) => ids.filter(Boolean),
  getMessageAuthorName: () => 'Staff',
  normalizeMessageBody: (text: string) => (text.trim() ? { ok: true, body: text.trim() } : { ok: false, error: 'Message body is required' }),
  serializeMessage: (m: { id: string }) => ({ id: m.id }),
}));

import { POST as postMemberMessage } from '@/app/api/admin/members/[id]/messages/route';
import { POST as postStaffMessage } from '@/app/api/admin/messages/thread/[threadId]/staff/route';
import { createNotification } from '@/lib/notifications/create';
import { STAFF_MESSAGE_NOTIFICATION_TITLE } from '@/lib/messages/staffMessageNotification';
import { NextRequest } from 'next/server';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) as never;
}

describe('admin staff replies notify the member', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userFindFirst.mockResolvedValue({ id: 'member-1' });
    db.messageCreate.mockResolvedValue({ id: 'msg-1' });
  });

  it('POST /api/admin/members/[id]/messages creates a message notification for the member', async () => {
    db.threadUpdate.mockResolvedValue({});
    const response = await postMemberMessage(
      jsonRequest('http://localhost/api/admin/members/member-1/messages', { body: 'Your paperwork is approved.' }),
      { params: Promise.resolve({ id: 'member-1' }) },
    );
    expect(response.status).toBe(200);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'member-1',
      type: 'message',
      title: STAFF_MESSAGE_NOTIFICATION_TITLE,
      body: 'Your paperwork is approved.',
      data: { threadId: 'thread-1', authorId: 'staff-1', link: '/dashboard/messages' },
    });
  });

  it('POST /api/admin/messages/thread/[threadId]/staff notifies the member of a member thread', async () => {
    db.threadUpdate.mockResolvedValue({ kind: 'member', memberId: 'member-7' });
    const response = await postStaffMessage(
      jsonRequest('http://localhost/api/admin/messages/thread/thread-9/staff', { body: 'Reply from the office.' }),
      { params: Promise.resolve({ threadId: 'thread-9' }) },
    );
    expect(response.status).toBe(200);
    expect(db.threadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'thread-9' }, select: { kind: true, memberId: true } }),
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'member-7',
        type: 'message',
        title: STAFF_MESSAGE_NOTIFICATION_TITLE,
        data: { threadId: 'thread-9', authorId: 'staff-1', link: '/dashboard/messages' },
      }),
    );
  });

  it('does not notify a member for an employer or partner thread', async () => {
    db.threadUpdate.mockResolvedValue({ kind: 'employer', memberId: null });
    const response = await postStaffMessage(
      jsonRequest('http://localhost/api/admin/messages/thread/thread-e/staff', { body: 'Hello employer.' }),
      { params: Promise.resolve({ threadId: 'thread-e' }) },
    );
    expect(response.status).toBe(200);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('does not notify when the body is rejected', async () => {
    const response = await postMemberMessage(
      jsonRequest('http://localhost/api/admin/members/member-1/messages', { body: '   ' }),
      { params: Promise.resolve({ id: 'member-1' }) },
    );
    expect(response.status).toBe(400);
    expect(db.messageCreate).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });
});
