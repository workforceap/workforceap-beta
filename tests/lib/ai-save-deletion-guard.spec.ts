import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  lock: vi.fn(),
  interactive: vi.fn(),
  trackEvent: vi.fn(),
}));

const tx = { user: { findUnique: mocks.findUnique }, aIToolResult: { create: mocks.create } };
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/db/transactionPolicy', () => ({ interactiveTransactionsGuaranteed: mocks.interactive }));
vi.mock('@/lib/billing/erasureGuard', () => ({ lockBillingMemberLifecycle: mocks.lock }));
vi.mock('@/lib/events/track', () => ({ trackEvent: mocks.trackEvent }));

import { saveAIToolResult } from '@/lib/ai/saveResult';

const MEMBER = '10000000-0000-4000-8000-000000000001';
const COUNSELOR = '10000000-0000-4000-8000-000000000002';
const active = { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  mocks.interactive.mockReturnValue(true);
  mocks.lock.mockResolvedValue(undefined);
  mocks.findUnique.mockResolvedValue(active);
  mocks.create.mockResolvedValue({ id: 'result-1' });
  mocks.trackEvent.mockResolvedValue(undefined);
});

describe('saveAIToolResult deletion barrier', () => {
  it('locks the subject before checking status and writing generated content', async () => {
    const id = await saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result', {
      actorUserId: COUNSELOR, actorName: 'Counselor', sessionId: 'session-1',
    });

    expect(id).toBe('result-1');
    expect(mocks.lock).toHaveBeenCalledExactlyOnceWith(tx, MEMBER);
    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: { id: MEMBER },
      select: { deletedAt: true, billingDeletionPendingAt: true, billingDeletionOperationId: true },
    });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        userId: MEMBER, toolType: 'resume_rewriter', inputSummary: 'Target role',
        output: 'Private result', parentToolResultId: null,
      },
      select: { id: true },
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.trackEvent).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['hard-deleted', null],
    ['soft-deleted', { ...active, deletedAt: new Date('2026-09-26') }],
    ['deletion pending', { ...active, billingDeletionPendingAt: new Date('2026-09-26') }],
    ['operation owned', { ...active, billingDeletionOperationId: 'delete-1' }],
  ])('refuses %s subject even though the caller already passed ensureUserInDb', async (_label, state) => {
    mocks.findUnique.mockResolvedValue(state);
    await expect(saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result'))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('waits behind the deletion barrier and never inserts after it commits', async () => {
    let releaseDeletion: (() => void) | undefined;
    const deletionOwnsLock = new Promise<void>((resolve) => { releaseDeletion = resolve; });
    let state: {
      deletedAt: Date | null;
      billingDeletionPendingAt: Date | null;
      billingDeletionOperationId: string | null;
    } = active;
    mocks.lock.mockImplementationOnce(async () => deletionOwnsLock);
    mocks.findUnique.mockImplementation(async () => state);

    const staleSave = saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result');
    await vi.waitFor(() => expect(mocks.lock).toHaveBeenCalledOnce());
    expect(mocks.findUnique).not.toHaveBeenCalled();
    state = { ...active, billingDeletionPendingAt: new Date('2026-09-26') };
    releaseDeletion?.();

    await expect(staleSave).rejects.toThrow('This account is no longer active.');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('uses the committed marker on flattened Preview without attempting an advisory lock', async () => {
    mocks.interactive.mockReturnValue(false);
    mocks.findUnique.mockResolvedValue({ ...active, billingDeletionPendingAt: new Date('2026-09-26') });
    await expect(saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result'))
      .rejects.toThrow('This account is no longer active.');
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('keeps ordinary saves available on migrated Preview', async () => {
    mocks.interactive.mockReturnValue(false);
    await saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result');
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('does not emit completion events if the result write fails', async () => {
    const failure = new Error('Database unavailable');
    mocks.create.mockRejectedValueOnce(failure);
    await expect(saveAIToolResult(MEMBER, 'resume_rewriter', 'Target role', 'Private result'))
      .rejects.toBe(failure);
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });
});
