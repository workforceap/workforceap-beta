// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), release: vi.fn(), mark: vi.fn(), create: vi.fn(), push: vi.fn(), discord: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { notification: { create: mocks.create } } }));
vi.mock('@/lib/member/uploadLifecycle', () => ({
  beginMemberUpload: mocks.begin,
  releaseMemberUpload: mocks.release,
  markMemberExternalEffectUncertain: mocks.mark,
  MemberUploadLifecycleError: class MemberUploadLifecycleError extends Error {},
}));
vi.mock('@/lib/push/sendWebPush', () => ({
  sendWebPushToUser: mocks.push,
  WebPushOutcomeUncertainError: class WebPushOutcomeUncertainError extends Error {},
}));
vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: mocks.discord }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));

import { createNotification } from '@/lib/notifications/create';
import { MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';
import { WebPushOutcomeUncertainError } from '@/lib/push/sendWebPush';

const input = () => ({ userId: 'member-1', subjectMemberId: 'member-1', type: 'program_complete' as const,
  title: 'Program complete', body: 'Synthetic completion' });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.begin.mockResolvedValue('claim-1');
  mocks.release.mockResolvedValue(undefined);
  mocks.mark.mockResolvedValue(undefined);
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
  expect(mocks.push).toHaveBeenCalledWith('member-1', expect.any(Object), 'claim-1', true);
  expect(mocks.release).not.toHaveBeenCalled();
  finishDiscord();
  await pending;
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1');
});

it('holds the subject member claim while notifying their counselor', async () => {
  mocks.begin.mockResolvedValueOnce('claim-1').mockResolvedValueOnce('claim-2');
  await createNotification({ ...input(), userId: 'counselor-1' });
  expect(mocks.begin.mock.calls).toEqual([['member-1', 'notification'], ['counselor-1', 'notification']]);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'counselor-1' }) }));
  expect(mocks.release.mock.calls).toEqual([['member-1', 'claim-1'], ['counselor-1', 'claim-2']]);
});

it('persists concurrent sibling notifications under independent claims', async () => {
  let sequence = 0;
  mocks.begin.mockImplementation(async () => `claim-${++sequence}`);
  await Promise.all([
    createNotification({ ...input(), title: 'First' }),
    createNotification({ ...input(), title: 'Second' }),
  ]);
  expect(mocks.create.mock.calls.map(([args]) => args.data.title)).toEqual(['First', 'Second']);
  expect(mocks.release.mock.calls.map((args) => args[1]).sort()).toEqual(['claim-1', 'claim-2']);
});

it('retains the exact claim when push outcome is unknown', async () => {
  mocks.push.mockRejectedValueOnce(new WebPushOutcomeUncertainError());
  await createNotification(input());
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1', 'notification_outcome_unknown');
  expect(mocks.release).not.toHaveBeenCalled();
});

it('keeps the claim when a notification write loses its database acknowledgment', async () => {
  mocks.create.mockRejectedValueOnce(new Error('commit acknowledgment lost'));
  await createNotification(input());
  expect(mocks.mark).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1', 'notification_outcome_unknown');
  expect(mocks.release).not.toHaveBeenCalled();
});

it('keeps a bounded push claim after a late provider promise resolves', async () => {
  vi.useFakeTimers();
  try {
    let finish!: () => void;
    mocks.push.mockImplementationOnce(() => new Promise<number>((resolve) => { finish = () => resolve(1); }));
    const pending = createNotification(input());
    await vi.advanceTimersByTimeAsync(7_501);
    await pending;
    expect(mocks.mark).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1', 'notification_outcome_unknown');
    expect(mocks.release).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(mocks.release).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('keeps a timed-out Discord claim after the late request settles', async () => {
  vi.useFakeTimers();
  try {
    let finish!: () => void;
    mocks.discord.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = createNotification(input());
    await vi.advanceTimersByTimeAsync(7_501);
    await pending;
    expect(mocks.mark).toHaveBeenCalledExactlyOnceWith('member-1', 'claim-1', 'notification_outcome_unknown');
    expect(mocks.release).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(mocks.release).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
