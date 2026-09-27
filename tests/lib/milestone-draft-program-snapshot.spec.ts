import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const { prisma } = await import('@/lib/db/prisma');
      return callback(prisma);
    }),
    $executeRaw: vi.fn(async () => 1),
    user: {
      findUnique: vi.fn(async () => ({ fullName: 'Jordan Learner' })),
      findFirst: vi.fn(async (args: { select?: { organizationId?: boolean } }) =>
        args.select?.organizationId
          ? { organizationId: 'org-1' }
          : { deletedAt: null, billingDeletionPendingAt: null, billingDeletionOperationId: null },
      ),
    },
    milestoneCascade: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));
vi.mock('@/lib/ai/anthropicChat', () => ({
  claudeChat: vi.fn(async () =>
    JSON.stringify({
      counselorBrief: 'Jordan reached the halfway point.',
      actions: [
        {
          type: 'flag_for_counselor_call',
          rationale: 'Check in on the remaining course plan.',
          confidence: 0.9,
        },
      ],
    }),
  ),
}));

import { draftCascade } from '@/lib/milestoneCascade/draftCascade';
import { prisma } from '@/lib/db/prisma';

describe('program milestone draft snapshots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a program-scoped snapshot without invented course fields', async () => {
    const result = await draftCascade({
      id: 'cascade-1',
      userId: 'user-1',
      milestoneType: 'program_halfway',
      contextSnapshot: {
        programSlug: 'program-one',
        completedCount: 2,
        totalCourses: 4,
        source: 'coursera-webhook',
        detectedAt: '2026-08-29T12:00:00.000Z',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: true, cascadeId: 'cascade-1' }),
    );
  });

  it('leaves the draft untouched if deletion begins after the initial user read', async () => {
    vi.mocked(prisma.user.findFirst)
      .mockResolvedValueOnce({ organizationId: 'org-1' } as any)
      .mockResolvedValueOnce({
        deletedAt: new Date('2026-08-29T12:01:00.000Z'),
        billingDeletionPendingAt: null,
        billingDeletionOperationId: null,
      } as any);
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ fullName: 'Jordan Learner' } as any)
      .mockResolvedValueOnce({
        deletedAt: new Date('2026-08-29T12:01:00.000Z'),
        billingDeletionPendingAt: null,
      } as any);

    const result = await draftCascade({
      id: 'cascade-1',
      userId: 'user-1',
      milestoneType: 'program_halfway',
      contextSnapshot: {
        programSlug: 'program-one',
        completedCount: 2,
        totalCourses: 4,
        source: 'coursera-webhook',
        detectedAt: '2026-08-29T12:00:00.000Z',
      },
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'member account is not active',
      retryable: false,
    });
    expect(prisma.milestoneCascade.updateMany).not.toHaveBeenCalled();
  });
});
