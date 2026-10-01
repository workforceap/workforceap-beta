import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';
import { MEMBER_ONLY_IDS, admittedIds } from '@/tests/helpers/prismaWhereMatches';

/**
 * POST /api/admin/messages/threads opens a counselor thread with a member.
 * Who counts as "a member" here is the one definition
 * (lib/admin/memberOnlyWhere.ts), so every account the funder numbers report
 * can be messaged (#2457 follow-up).
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  userFindFirst: vi.fn(),
  getOrCreateMemberCounselorThread: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/messages/counselorThread', () => ({ getOrCreateMemberCounselorThread: mocks.getOrCreateMemberCounselorThread }));
vi.mock('@/lib/messages/superAdminMessageQueries', () => ({
  getSlaStatusForThreads: async () => new Map(),
  getThreadIdsBreachingSla: async () => [],
}));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/db/prisma', () => {
  const prisma: Record<string, unknown> = {
    user: { findFirst: mocks.userFindFirst },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

import { POST as openMemberThread } from '@/app/api/admin/messages/threads/route';

const MEMBER_ID = '00000000-0000-0000-0000-00000000aaaa';

function post(body: unknown) {
  return new Request('https://workforceap.org/api/admin/messages/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'super-admin-a' });
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.getOrCreateMemberCounselorThread.mockResolvedValue({ id: 'thread-1' });
});

describe('POST /api/admin/messages/threads member eligibility', () => {
  it('looks the member up by the one member definition, not profile.role alone', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: MEMBER_ID, fullName: 'Pat Jones' });

    const res = await openMemberThread(post({ memberId: MEMBER_ID }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ threadId: 'thread-1', memberName: 'Pat Jones' });
    expect(mocks.userFindFirst).toHaveBeenCalledTimes(1);
    const { where } = mocks.userFindFirst.mock.calls[0][0];
    expect(where).toEqual({ id: MEMBER_ID, deletedAt: null, NOT: MEMBER_ONLY_ROLE_NOT });
    // A user_roles-only member can be messaged; a counselor holding the
    // baseline member row, an employer and a role-less account cannot.
    expect(admittedIds({ ...where, id: undefined })).toEqual([...MEMBER_ONLY_IDS]);
    expect(mocks.getOrCreateMemberCounselorThread).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('answers 404 without opening a thread when the account is not a member', async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    const res = await openMemberThread(post({ memberId: MEMBER_ID }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(mocks.getOrCreateMemberCounselorThread).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
