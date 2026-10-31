import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const findMany = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const draftCascade = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    milestoneCascade: { findMany, updateMany },
  },
}));

vi.mock('@/lib/milestoneCascade/draftCascade', () => ({
  draftCascade,
}));

import { runMilestoneCascadeDraftTick } from '@/lib/milestoneCascade/runDraftTick';

const pending = (id: string) => ({
  id,
  userId: `user-${id}`,
  milestoneType: 'program_halfway',
  contextSnapshot: { programSlug: 'program-one' },
});

describe('runMilestoneCascadeDraftTick', () => {
  beforeEach(() => {
    findMany.mockReset();
    updateMany.mockReset();
    draftCascade.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it('counts drafted, retryable, and terminal outcomes and only expires terminal rows', async () => {
    findMany.mockResolvedValue([pending('ok-1'), pending('retry-1'), pending('term-1')]);
    draftCascade
      .mockResolvedValueOnce({ ok: true, cascadeId: 'ok-1', promptVersion: 'v1' })
      .mockResolvedValueOnce({
        ok: false,
        cascadeId: 'retry-1',
        reason: 'llm timeout',
        retryable: true,
      })
      .mockResolvedValueOnce({
        ok: false,
        cascadeId: 'term-1',
        reason: 'bad context_snapshot',
        retryable: false,
      });

    const result = await runMilestoneCascadeDraftTick({ batchSize: 10 });

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'pending_draft' },
      select: {
        id: true,
        userId: true,
        milestoneType: true,
        contextSnapshot: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
    expect(result).toEqual({
      candidates: 3,
      drafted: 1,
      failedRetryable: 1,
      failedTerminal: 1,
      outcomes: [
        { cascadeId: 'ok-1', status: 'drafted' },
        { cascadeId: 'retry-1', status: 'retry', reason: 'llm timeout' },
        { cascadeId: 'term-1', status: 'expired', reason: 'bad context_snapshot' },
      ],
    });
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'term-1', status: 'pending_draft' },
      data: expect.objectContaining({
        status: 'expired',
        dismissedReason: '[auto-expired] bad context_snapshot',
      }),
    });
  });

  it('returns empty counters when the pending_draft queue is empty', async () => {
    findMany.mockResolvedValue([]);
    await expect(runMilestoneCascadeDraftTick()).resolves.toEqual({
      candidates: 0,
      drafted: 0,
      failedRetryable: 0,
      failedTerminal: 0,
      outcomes: [],
    });
    expect(draftCascade).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].take).toBe(25);
  });
});
