import { describe, it, expect, vi, beforeEach } from 'vitest';

const lifetime = vi.hoisted(() => ({ after: vi.fn() }));
const discord = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('next/server', () => ({ after: lifetime.after }));
vi.mock('@/lib/notify/discord', () => ({ notifyDiscord: discord.notify }));
vi.mock('@/lib/push/sendWebPush', () => ({ sendWebPushToUser: vi.fn(async () => undefined) }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(async () => undefined) }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiResponseError: vi.fn(),  captureApiError: vi.fn() }));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (arg: any) => { const { prisma } = await import('@/lib/db/prisma'); return typeof arg === 'function' ? arg(prisma) : Promise.all(arg); }),
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import { createNotification, createBulkNotifications } from '@/lib/notifications/create';
import { prisma as _prisma } from '@/lib/db/prisma';
const prisma = _prisma as any;

describe('createNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discord.notify.mockResolvedValue(undefined);
    lifetime.after.mockImplementation((task: Promise<unknown> | (() => unknown)) => {
      if (typeof task === 'function') void task();
    });
  });

  it('creates a single notification', async () => {
    const payload = {
      userId: 'user-1',
      type: 'message' as const,
      title: 'Test',
      body: 'Hello',
      data: { threadId: 't1' },
    };
    prisma.notification.create.mockResolvedValue({ id: 'notif-1', ...payload });

    await createNotification(payload);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'message',
          title: 'Test',
          body: 'Hello',
          data: { threadId: 't1' },
        }),
      })
    );
  });

  it('handles empty userId by silently failing', async () => {
    prisma.notification.create.mockRejectedValue(new Error('violates not-null'));

    await expect(
      createNotification({
        userId: '',
        type: 'message',
        title: 'Test',
        body: 'Hello',
      })
    ).resolves.toBeUndefined();
  });

  it('survives DB errors without throwing', async () => {
    prisma.notification.create.mockRejectedValue(new Error('DB down'));

    await expect(
      createNotification({
        userId: 'user-1',
        type: 'message',
        title: 'Test',
        body: 'Hello',
      })
    ).resolves.toBeUndefined();
    expect(prisma.notification.create).toHaveBeenCalled();
  });


  it('registers retained Discord work synchronously even when the outer caller discards the promise', async () => {
    let finishDb!: () => void;
    prisma.notification.create.mockImplementationOnce(() => new Promise((resolve) => { finishDb = () => resolve({ id: 'notif-1' }); }));
    const retained: Promise<unknown>[] = [];
    lifetime.after.mockImplementationOnce((task: Promise<unknown> | (() => unknown)) => {
      retained.push(typeof task === 'function' ? Promise.resolve(task()) : task);
    });
    let settleDiscord!: () => void;
    discord.notify.mockImplementationOnce(() => new Promise<void>((resolve) => { settleDiscord = resolve; }));

    void createNotification({ userId: 'user-1', type: 'message', title: 'Test', body: 'Hello' });
    expect(lifetime.after).toHaveBeenCalledOnce();
    expect(retained).toHaveLength(1);
    expect(discord.notify).not.toHaveBeenCalled();

    finishDb();
    await vi.waitFor(() => expect(discord.notify).toHaveBeenCalledOnce());
    let retainedSettled = false;
    void retained[0].then(() => { retainedSettled = true; });
    await Promise.resolve();
    expect(retainedSettled).toBe(false);
    settleDiscord();
    await retained[0];
    expect(retainedSettled).toBe(true);
  });

  it('remains pending until its Discord companion settles', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
    let settle!: () => void;
    discord.notify.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve; }));
    let completed = false;
    const pending = createNotification({ userId: 'user-1', type: 'message', title: 'Test', body: 'Hello' })
      .then(() => { completed = true; });
    await vi.waitFor(() => expect(discord.notify).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    settle();
    await pending;
    expect(completed).toBe(true);
  });
});

describe('createBulkNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    discord.notify.mockResolvedValue(undefined);
    lifetime.after.mockImplementation((task: Promise<unknown> | (() => unknown)) => {
      if (typeof task === 'function') void task();
    });
  });

  it('creates bulk notifications', async () => {
    const items = [
      { userId: 'user-1', type: 'broadcast' as const, title: 'A', body: 'B' },
      { userId: 'user-2', type: 'broadcast' as const, title: 'A', body: 'B' },
    ];
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await createBulkNotifications(items);
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ userId: 'user-1', type: 'broadcast', title: 'A', body: 'B', data: null }),
          expect.objectContaining({ userId: 'user-2', type: 'broadcast', title: 'A', body: 'B', data: null }),
        ],
      })
    );
  });

  it('skips empty array without calling DB', async () => {
    await createBulkNotifications([]);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('survives DB errors without throwing', async () => {
    prisma.notification.createMany.mockRejectedValue(new Error('timeout'));

    await expect(
      createBulkNotifications([
        { userId: 'user-1', type: 'broadcast' as const, title: 'A', body: 'B' },
      ])
    ).resolves.toBeUndefined();
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });

  it('registers one aggregated retained Discord task before a discarded bulk caller reaches its DB await', async () => {
    let finishDb!: () => void;
    prisma.notification.createMany.mockImplementationOnce(() => new Promise((resolve) => { finishDb = () => resolve({ count: 2 }); }));
    const retained: Promise<unknown>[] = [];
    lifetime.after.mockImplementationOnce((task: Promise<unknown> | (() => unknown)) => {
      retained.push(typeof task === 'function' ? Promise.resolve(task()) : task);
    });
    let settleDiscord!: () => void;
    discord.notify.mockImplementationOnce(() => new Promise<void>((resolve) => { settleDiscord = resolve; }));
    const items = [
      { userId: 'user-1', type: 'broadcast' as const, title: 'A', body: 'B' },
      { userId: 'user-2', type: 'broadcast' as const, title: 'A', body: 'B' },
    ];

    void createBulkNotifications(items);
    expect(lifetime.after).toHaveBeenCalledOnce();
    expect(retained).toHaveLength(1);
    expect(discord.notify).not.toHaveBeenCalled();
    finishDb();
    await vi.waitFor(() => expect(discord.notify).toHaveBeenCalledOnce());
    expect(discord.notify).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Bulk notification: A', fields: [{ name: 'recipients', value: '2' }],
    }));
    settleDiscord();
    await retained[0];
    expect(discord.notify).toHaveBeenCalledOnce();
  });

  it('emits one aggregated Discord notification and remains pending until it settles', async () => {
    const items = [
      { userId: 'user-1', type: 'broadcast' as const, title: 'A', body: 'B' },
      { userId: 'user-2', type: 'broadcast' as const, title: 'A', body: 'B' },
    ];
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    let settle!: () => void;
    discord.notify.mockImplementationOnce(() => new Promise<void>((resolve) => { settle = resolve; }));
    let completed = false;
    const pending = createBulkNotifications(items).then(() => { completed = true; });
    await vi.waitFor(() => expect(discord.notify).toHaveBeenCalledOnce());
    expect(discord.notify).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Bulk notification: A',
      fields: [{ name: 'recipients', value: '2' }],
    }));
    expect(completed).toBe(false);
    settle();
    await pending;
    expect(completed).toBe(true);
  });

});
