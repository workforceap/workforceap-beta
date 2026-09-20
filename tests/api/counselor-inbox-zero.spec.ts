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

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  isAdmin: vi.fn(),
  isCounselor: vi.fn(),
}));

vi.mock('@/lib/counselor/inboxZero', () => ({
  getInboxZeroQueue: vi.fn(),
  INBOX_ZERO_DISMISS_ACTION: 'counselor.inbox_zero.dismiss',
}));

vi.mock('@/lib/counselor/staffMemberAccess', () => ({
  assertStaffCanAccessMemberRecord: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    memberEvent: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (req: Request) => Promise<Response>) => handler,
}));

import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { getInboxZeroQueue } from '@/lib/counselor/inboxZero';
import { emptyReasonCounts } from '@/lib/attention/reasons';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { auditLog } from '@/lib/audit';
import { prisma } from '@/lib/db/prisma';
import { GET } from '@/app/api/counselor/inbox-zero/route';
import { POST } from '@/app/api/counselor/inbox-zero/dismiss/route';

const MEMBER_ID = '11111111-1111-1111-1111-111111111111';
const COUNSELOR_ID = '22222222-2222-2222-2222-222222222222';

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe('GET /api/counselor/inbox-zero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns queue for counselor', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR_ID, email: 'c@wap.org' } as never);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(getInboxZeroQueue).mockResolvedValue({
      rows: [],
      totals: {
        total: 0,
        dismissedToday: 0,
        byFlag: emptyReasonCounts(),
      },
    });

    const res = await GET(makeRequest('http://localhost/api/counselor/inbox-zero'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queue.totals.total).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const res = await GET(makeRequest('http://localhost/api/counselor/inbox-zero'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/counselor/inbox-zero/dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({} as never);
    vi.mocked(auditLog).mockResolvedValue(undefined);
  });

  it('dismisses with note and writes audit log', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR_ID, email: 'c@wap.org' } as never);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(false);
    vi.mocked(assertStaffCanAccessMemberRecord).mockResolvedValue(true);

    const res = await POST(
      makeRequest('http://localhost/api/counselor/inbox-zero/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: MEMBER_ID,
          reason: 'Called member — resume uploaded',
          flags: ['resume_missing_3d'],
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'counselor.inbox_zero.dismiss',
        targetId: MEMBER_ID,
        metadata: expect.objectContaining({
          memberId: MEMBER_ID,
          reason: 'Called member — resume uploaded',
        }),
      }),
    );
  });

  it('returns 400 when reason missing', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: COUNSELOR_ID, email: 'c@wap.org' } as never);
    vi.mocked(isCounselor).mockResolvedValue(true);
    vi.mocked(isAdmin).mockResolvedValue(false);

    const res = await POST(
      makeRequest('http://localhost/api/counselor/inbox-zero/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: MEMBER_ID, reason: '' }),
      }),
    );

    expect(res.status).toBe(400);
  });
});
