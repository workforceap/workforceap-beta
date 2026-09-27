import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), activeWrite: vi.fn(), userUpdate: vi.fn(), profileUpsert: vi.fn(), invalidate: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (route: unknown) => route }));
vi.mock('@/lib/member/activeWrite', () => {
  class MemberLifecycleWriteError extends Error {
    constructor() { super('This account is no longer active.'); }
  }
  return { MemberLifecycleWriteError, withActiveMemberWrite: mocks.activeWrite };
});
vi.mock('@/lib/member/getMemberState', () => ({ invalidateMemberState: mocks.invalidate }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));

import { PATCH } from '@/app/api/member/dashboard-profile/route';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const request = () => new Request('http://localhost/api/member/dashboard-profile', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Jane', lastName: 'Doe', phone: '5125550100', address: '123 Main St',
    linkedin: null, bio: 'Updated member biography',
  }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'member-1', email: 'jane@example.com' });
  mocks.userUpdate.mockResolvedValue({});
  mocks.profileUpsert.mockResolvedValue({});
  mocks.invalidate.mockResolvedValue(undefined);
  mocks.activeWrite.mockImplementation(async (
    _userId: string,
    write: (tx: { user: { update: typeof mocks.userUpdate }; profile: { upsert: typeof mocks.profileUpsert } }) => Promise<unknown>,
  ) => write({ user: { update: mocks.userUpdate }, profile: { upsert: mocks.profileUpsert } }));
});

describe('dashboard profile deletion barrier', () => {
  it('saves PII only within the active-member write boundary', async () => {
    const response = await PATCH(request());
    expect(response.status).toBe(200);
    expect(mocks.activeWrite).toHaveBeenCalledWith('member-1', expect.any(Function));
    expect(mocks.userUpdate).toHaveBeenCalledOnce();
    expect(mocks.profileUpsert).toHaveBeenCalledOnce();
  });

  it('refuses an in-flight save after erasure and keeps scrubbed fields clear', async () => {
    mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
    const response = await PATCH(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'This account is no longer active.' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.profileUpsert).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
