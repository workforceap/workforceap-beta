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

import { WEB_PUSH_DEADLINE_MS, sendWebPushToUser } from '@/lib/push/sendWebPush';

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
    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' })).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('awaits the provider promise rather than racing a duplicate local timer', async () => {
    vi.useFakeTimers();
    try {
      mock.findUser.mockResolvedValue(active);
      let finish!: () => void;
      mock.send.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
      let settled = false;
      const result = sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' })
        .then((count) => { settled = true; return count; });
      await vi.advanceTimersByTimeAsync(WEB_PUSH_DEADLINE_MS + 1);
      expect(mock.send).toHaveBeenCalledWith(expect.any(Object), expect.any(String), { timeout: WEB_PUSH_DEADLINE_MS });
      expect(settled).toBe(false);
      finish();
      expect(await result).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles a VAPID configuration failure before loading subscriptions or calling the provider', async () => {
    vi.resetModules();
    const { sendWebPushToUser: fromFreshModule } = await import('@/lib/push/sendWebPush');
    mock.configure.mockImplementationOnce(() => { throw new Error('invalid VAPID key'); });
    expect(await fromFreshModule('member-1', { title: 'Private', body: 'Claimed' })).toBe(0);
    expect(mock.findSubscriptions).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it('releases a settled provider socket timeout', async () => {
    vi.useFakeTimers();
    try {
      mock.findUser.mockResolvedValue(active);
      mock.send.mockImplementationOnce((_subscription, _body, options: { timeout: number }) =>
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('provider socket timed out')), options.timeout)));
      const result = sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' });
      await vi.advanceTimersByTimeAsync(WEB_PUSH_DEADLINE_MS + 1);
      expect(await result).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a completed 400 provider rejection as a known non-delivery', async () => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce({ statusCode: 400 });
    expect(await sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' })).toBe(0);
  });

  it.each([408, 429, 503])('releases a settled provider rejection HTTP %i', async (statusCode) => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce({ statusCode });
    await expect(sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }))
      .resolves.toBe(0);
  });

  it('releases a settled connection refusal with no local send still running', async () => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce(Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' }));
    await expect(sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }))
      .resolves.toBe(0);
  });

  it.each([null, undefined])('releases a settled provider rejection even without an error object (%s)', async (reason) => {
    mock.findUser.mockResolvedValue(active);
    mock.send.mockRejectedValueOnce(reason);
    await expect(sendWebPushToUser('member-1', { title: 'Private', body: 'Claimed' }))
      .resolves.toBe(0);
  });
});
