import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  findUser: vi.fn(),
  findSubscriptions: vi.fn(),
  send: vi.fn(),
  configure: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ default: { setVapidDetails: mock.configure, sendNotification: mock.send } }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mock.findUser },
    pushSubscription: { findMany: mock.findSubscriptions, delete: vi.fn(async () => ({})) },
  },
}));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));

import { WEB_PUSH_DEADLINE_MS, WebPushOutcomeUncertainError, sendWebPushToUser } from '@/lib/push/sendWebPush';

const active = { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };
const subscription = { id: 'sub-1', endpoint: 'https://push.example.test/one', p256dh: 'p', auth: 'a' };
const priorPublic = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
const priorPrivate = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

describe('sendWebPushToUser account lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = 'test-public';
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'test-private';
    mock.findSubscriptions.mockResolvedValue([subscription]);
    mock.send.mockResolvedValue({ statusCode: 201 });
  });

  afterEach(() => {
    if (priorPublic === undefined) delete process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = priorPublic;
    if (priorPrivate === undefined) delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    else process.env.WEB_PUSH_VAPID_PRIVATE_KEY = priorPrivate;
  });

  it.each([
    [{ ...active, deletedAt: new Date() }, 'deleted'],
    [{ ...active, billingDeletionPendingAt: new Date() }, 'pending deletion'],
    [{ ...active, billingDeletionOperationId: 'claim-1' }, 'claimed deletion'],
    [null, 'missing'],
  ] as const)('does not load or contact subscriptions for a %s account (%s)', async (member, _label) => {
    mock.findUser.mockResolvedValue(member);

    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Do not deliver' })).toBe(0);
    expect(mock.findSubscriptions).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('rechecks after loading subscriptions before calling the push provider', async () => {
    mock.findUser.mockResolvedValueOnce(active).mockResolvedValueOnce({ ...active, deletedAt: new Date() });

    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Do not deliver' })).toBe(0);
    expect(mock.findSubscriptions).toHaveBeenCalledOnce();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('still delivers to an active account', async () => {
    mock.findUser.mockResolvedValue(active);

    expect(await sendWebPushToUser('member-1', { title: 'Hello', body: 'Active' })).toBe(1);
    expect(mock.send).toHaveBeenCalledOnce();
  });

  it('does not label a failed final account read as an uncertain provider send', async () => {
    mock.findUser.mockResolvedValueOnce(active).mockRejectedValueOnce(new Error('database unavailable'));
    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }, 'claim-1')).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('bounds a hung claimed push and reports an unknown outcome', async () => {
    vi.useFakeTimers();
    try {
      mock.findUser.mockResolvedValue(active);
      let finish!: () => void;
      mock.send.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
      const result = expect(sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }, 'claim-1'))
        .rejects.toBeInstanceOf(WebPushOutcomeUncertainError);
      await vi.advanceTimersByTimeAsync(WEB_PUSH_DEADLINE_MS + 1);
      await result;
      finish();
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a completed 400 provider rejection as a known non-delivery', async () => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce({ statusCode: 400 });
    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }, 'claim-1')).toBe(0);
  });

  it.each([408, 429, 503])('retains a claimed send for ambiguous HTTP %i', async (statusCode) => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce({ statusCode });
    await expect(sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }, 'claim-1'))
      .rejects.toBeInstanceOf(WebPushOutcomeUncertainError);
  });
});
