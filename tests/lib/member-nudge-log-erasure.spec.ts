// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), activeWrite: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { memberNudgeLog: { create: mocks.create } } }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));

import { recordNudgeSent } from '@/lib/cron/nudgeThrottle';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

beforeEach(() => { vi.resetAllMocks(); });

it('does not recreate a nudge log when erasure wins after email acceptance', async () => {
  mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
  await recordNudgeSent({ userId: 'member-1', tier: 'yellow', kind: 'funding_update' });
  expect(mocks.activeWrite).toHaveBeenCalledWith('member-1', expect.any(Function));
  expect(mocks.create).not.toHaveBeenCalled();
});
