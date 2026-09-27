// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), llm: vi.fn(), activeWrite: vi.fn(), update: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: mocks.user }, milestoneCascade: { updateMany: mocks.update },
} }));
vi.mock('@/lib/ai/anthropicChat', () => ({ claudeChat: mocks.llm }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));

import { draftCascade } from '@/lib/milestoneCascade/draftCascade';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const cascade = {
  id: 'cascade-1', userId: 'member-1', milestoneType: 'first_course_completed',
  contextSnapshot: {
    courseSlug: 'synthetic-course', courseName: 'Synthetic course', programSlug: null,
    completedCount: 1, source: 'member', detectedAt: '2026-09-26T00:00:00Z',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({
    fullName: 'Original Name', deletedAt: null, billingDeletionPendingAt: null,
    billingDeletionOperationId: null,
  });
  mocks.llm.mockResolvedValue(JSON.stringify({
    counselorBrief: 'Synthetic counselor brief',
    actions: [{
      type: 'celebrate_milestone', channel: 'email', subject: 'Synthetic milestone',
      body: 'Synthetic message body', rationale: 'Synthetic rationale', confidence: 0.9,
    }],
  }));
});

it('does not save an LLM draft when deletion starts while the model runs', async () => {
  mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
  mocks.user.mockResolvedValueOnce({
    fullName: 'Original Name', deletedAt: null, billingDeletionPendingAt: null,
    billingDeletionOperationId: null,
  }).mockResolvedValueOnce({ deletedAt: new Date(), billingDeletionPendingAt: new Date() });
  const result = await draftCascade(cascade);
  expect(mocks.llm).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ ok: false, retryable: false, reason: 'member account is not active' });
  expect(mocks.update).not.toHaveBeenCalled();
});

it('does not send a deleted member name to the model', async () => {
  mocks.user.mockResolvedValueOnce({
    fullName: 'Original Name', deletedAt: new Date(), billingDeletionPendingAt: null,
    billingDeletionOperationId: null,
  });
  const result = await draftCascade(cascade);
  expect(result).toMatchObject({ ok: false, retryable: false });
  expect(mocks.llm).not.toHaveBeenCalled();
});
