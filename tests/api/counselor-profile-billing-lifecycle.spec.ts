// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'c0000000-0000-4000-8000-000000000003';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isCounselor: vi.fn(),
  lock: vi.fn(),
  own: vi.fn(),
  updateUser: vi.fn(),
  updateProfile: vi.fn(),
  updateCounselor: vi.fn(),
  auditLog: vi.fn(),
  state: { deletionPending: false },
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) },
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isCounselor: mocks.isCounselor }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/billing/erasureGuard', () => ({ lockBillingMemberLifecycle: mocks.lock }));
vi.mock('@/lib/db/prisma', () => {
  const tx = {
    counselor: { findFirst: mocks.own, update: mocks.updateCounselor },
    user: { updateMany: mocks.updateUser },
    profile: { updateMany: mocks.updateProfile },
  };
  return { prisma: { $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) } };
});

import { PATCH } from '@/app/api/counselor/profile/route';

function request() {
  return new Request('http://localhost/api/counselor/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Casey Counselor', phone: '512-555-0100', title: 'Advisor' }),
  });
}

describe('counselor profile and billing lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.deletionPending = false;
    mocks.getUser.mockResolvedValue({ id: USER_ID });
    mocks.isCounselor.mockResolvedValue(true);
    mocks.lock.mockResolvedValue(undefined);
    mocks.own.mockResolvedValue({ id: 'counselor-profile' });
    mocks.updateUser.mockImplementation(async ({ where }: { where: { billingDeletionPendingAt: Date | null } }) => ({
      count: mocks.state.deletionPending && where.billingDeletionPendingAt === null ? 0 : 1,
    }));
    mocks.updateProfile.mockResolvedValue({ count: 1 });
    mocks.updateCounselor.mockResolvedValue({ id: 'counselor-profile' });
    mocks.auditLog.mockResolvedValue(undefined);
  });

  it('waits for the counselor lifecycle lock before writing User, Profile, or Counselor', async () => {
    let release!: () => void;
    mocks.lock.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = PATCH(request() as never);
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), USER_ID));
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.updateCounselor).not.toHaveBeenCalled();

    release();
    expect((await pending).status).toBe(200);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
    expect(mocks.updateUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateCounselor.mock.invocationCallOrder[0]);
  });

  it('refuses a profile write once deletion has committed its marker', async () => {
    mocks.state.deletionPending = true;
    const response = await PATCH(request() as never);
    expect(response.status).toBe(409);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.updateCounselor).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it('uses the deletion marker compare-and-set on flattened Preview without an advisory lock', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    try {
      mocks.state.deletionPending = true;
      expect((await PATCH(request() as never)).status).toBe(409);
      expect(mocks.lock).not.toHaveBeenCalled();
      expect(mocks.updateCounselor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
