import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
}));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: vi.fn(() => Promise.resolve(false)), isAdmin: vi.fn(), isCounselor: vi.fn() }));
vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/counselor/inboxZeroAudit', () => ({ logInboxZeroBulkAuditEvent: vi.fn() }));
vi.mock('@/lib/messages/counselorThread', () => ({
  getOrCreateMemberCounselorThread: vi.fn(),
  assertStaffCanPost: vi.fn(),
  normalizeMessageBody: vi.fn((body: string) => ({ ok: true, body })),
}));
vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
}));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn((_orgId: string, fn: (db: unknown) => unknown) =>
    fn({
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          fullName: 'Test Member',
          enrolledProgram: 'it-support',
        }),
      },
    }),
  ),
}));
vi.mock('@/lib/db/prisma', () => {
  const prisma: any = {
    user: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    message: { create: vi.fn().mockResolvedValue({ id: 'msg-1' }) },
    counselor: { findFirst: vi.fn() },
    counselorAssignment: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    messageThread: { update: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: 'thread-1' }) },
    memberEvent: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  prisma.$transaction = vi.fn((arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return { prisma };
});
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (req: Request) => Promise<Response>) => handler,
}));

import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { auditLog } from '@/lib/audit';
import { logInboxZeroBulkAuditEvent } from '@/lib/counselor/inboxZeroAudit';
import { assertStaffCanPost, getOrCreateMemberCounselorThread } from '@/lib/messages/counselorThread';
import { prisma } from '@/lib/db/prisma';
import { POST } from '@/app/api/counselor/inbox-zero/bulk/route';

const MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const COUNSELOR_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_COUNSELOR_USER = '33333333-3333-3333-3333-333333333333';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/counselor/inbox-zero/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/counselor/inbox-zero/bulk', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActorOrganizationId).mockResolvedValue('org-1');
    vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR_ID, email: 'c@wap.org' } as never);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);
    vi.mocked(auditLog).mockResolvedValue(undefined);
    vi.mocked(logInboxZeroBulkAuditEvent).mockResolvedValue(undefined);
    vi.mocked(getOrCreateMemberCounselorThread).mockResolvedValue({ id: 'thread-1' } as never);
    vi.mocked(assertStaffCanPost).mockResolvedValue({
      id: 'thread-1',
      kind: 'member',
      memberId: MEMBER_ID,
      counselorUserId: COUNSELOR_ID,
    } as never);
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({} as never);
  });

  it('mark_contacted writes audit log and AuditEvent', async () => {
    const res = await POST(makeRequest({ action: 'mark_contacted', memberIds: [MEMBER_ID] }));
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'counselor.inbox_zero.contacted' }),
    );
    expect(logInboxZeroBulkAuditEvent).toHaveBeenCalled();
  });

  it('follow_up sends message and audits', async () => {
    const res = await POST(
      makeRequest({ action: 'follow_up', memberIds: [MEMBER_ID], templateId: 'check_in' }),
    );
    expect(res.status).toBe(200);
    expect(logInboxZeroBulkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'launched' }),
    );
  });

  it('reassign updates assignment', async () => {
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: 'counselor-row',
      userId: TARGET_COUNSELOR_USER,
      user: { id: TARGET_COUNSELOR_USER, fullName: 'Pat Advisor' },
    } as never);
    vi.mocked(prisma.counselorAssignment.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.messageThread.update).mockResolvedValue({} as never);

    const res = await POST(
      makeRequest({
        action: 'reassign',
        memberIds: [MEMBER_ID],
        counselorUserId: TARGET_COUNSELOR_USER,
      }),
    );
    expect(res.status).toBe(200);
    expect(prisma.messageThread.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { memberId: MEMBER_ID }, update: { counselorUserId: TARGET_COUNSELOR_USER } }));
    expect(logInboxZeroBulkAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'completed' }),
    );
  });

  it.each(['audit log', 'audit event', 'both'] as const)('reports committed reassignment with a warning when %s fails', async (failure) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: 'counselor-row', userId: TARGET_COUNSELOR_USER,
      user: { id: TARGET_COUNSELOR_USER, fullName: 'Pat Advisor' },
    } as never);
    if (failure !== 'audit event') vi.mocked(auditLog).mockRejectedValueOnce(new Error('Synthetic audit failure'));
    if (failure !== 'audit log') vi.mocked(logInboxZeroBulkAuditEvent).mockRejectedValueOnce(new Error('Synthetic event failure'));

    const res = await POST(makeRequest({ action: 'reassign', memberIds: [MEMBER_ID], counselorUserId: TARGET_COUNSELOR_USER }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, sent: 1, failed: 0,
      results: [{ memberId: MEMBER_ID, ok: true, warning: expect.stringContaining('Counselor assigned') }],
      warnings: [expect.stringContaining('do not repeat the reassignment')],
    });
    expect(prisma.messageThread.upsert).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(logInboxZeroBulkAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps transaction failure as a failed item without an audit warning or success receipt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(prisma.counselor.findFirst).mockResolvedValue({
      id: 'counselor-row', userId: TARGET_COUNSELOR_USER,
      user: { id: TARGET_COUNSELOR_USER, fullName: 'Pat Advisor' },
    } as never);
    vi.mocked(prisma.messageThread.upsert).mockRejectedValueOnce(new Error('Synthetic transaction failure'));

    const res = await POST(makeRequest({ action: 'reassign', memberIds: [MEMBER_ID], counselorUserId: TARGET_COUNSELOR_USER }));

    expect(await res.json()).toMatchObject({ sent: 0, failed: 1,
      results: [{ memberId: MEMBER_ID, ok: false, error: 'internal' }], warnings: [],
    });
    expect(auditLog).not.toHaveBeenCalled();
    expect(logInboxZeroBulkAuditEvent).not.toHaveBeenCalled();
  });
});
