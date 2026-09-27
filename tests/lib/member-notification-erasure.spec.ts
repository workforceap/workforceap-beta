// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), release: vi.fn(), create: vi.fn(), push: vi.fn(), discord: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { notification: { create: mocks.create } } }));
vi.mock('@/lib/member/uploadLifecycle', () => ({
  beginMemberUpload: mocks.begin,
  releaseMemberUpload: mocks.release,
  MemberUploadLifecycleError: class MemberUploadLifecycleError extends Error {},
}));
vi.mock('@/lib/push/sendWebPush', () => ({ sendWebPushToUser: mocks.push }));
vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: mocks.discord }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { createNotification } from '@/lib/notifications/create';
import { MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

const input = () => ({ userId: 'member-1', subjectMemberId: 'member-1', type: 'program_complete' as const,
  title: 'Program complete', body: 'Synthetic completion' });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.begin.mockResolvedValue('claim-1');
  mocks.release.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ id: 'notification-1' });
  mocks.push.mockResolvedValue(1);
  mocks.discord.mockResolvedValue(undefined);
});

it('does not persist or dispatch a notification when erasure won the lifecycle claim', async () => {
  mocks.begin.mockRejectedValueOnce(new MemberUploadLifecycleError());
  await createNotification(input());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.discord).not.toHaveBeenCalled();
});

it('holds the lifecycle claim until persistence, push, and Discord settle', async () => {
  let finishDiscord!: () => void;
  mocks.discord.mockImplementationOnce(() => new Promise<void>((resolve) => { finishDiscord = resolve; }));
  const pending = createNotification(input());
  for (let i = 0; i < 20 && !finishDiscord; i++) await Promise.resolve();
  expect(finishDiscord).toBeTypeOf('function');
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.push).toHaveBeenCalledWith('member-1', expect.any(Object), 'claim-1');
  expect(mocks.release).not.toHaveBeenCalled();
  finishDiscord();
  await pending;
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1');
});

it('holds the subject member claim while notifying their counselor', async () => {
  await createNotification({ ...input(), userId: 'counselor-1' });
  expect(mocks.begin).toHaveBeenCalledExactlyOnceWith('member-1');
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'counselor-1' }) }));
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1');
});
