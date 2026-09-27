// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeWrite: vi.fn(), findAction: vi.fn(), findEvent: vi.fn(), createAction: vi.fn(),
  updateActions: vi.fn(), bullet: vi.fn(), jobMatch: vi.fn(), diagnostic: vi.fn(),
  event: vi.fn(), notification: vi.fn(), assignments: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {
  memberNextBestAction: { findFirst: mocks.findAction },
  memberEvent: { findFirst: mocks.findEvent },
  counselorAssignment: { findMany: mocks.assignments },
} }));
vi.mock('@/lib/member/activeWrite', () => ({
  MemberLifecycleWriteError: class MemberLifecycleWriteError extends Error {},
  withActiveMemberWrite: mocks.activeWrite,
}));
vi.mock('@/lib/ai/proactiveResumeGenerator', () => ({ generateResumeBullet: mocks.bullet }));
vi.mock('@/lib/ai/proactiveJobMatcher', () => ({ findBestEmployerMatch: mocks.jobMatch }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.diagnostic }));
vi.mock('@/lib/events/track', () => ({ persistEvent: mocks.event }));
vi.mock('@/lib/notifications/create', () => ({ createNotification: mocks.notification }));

import { handleLearningCompletion, handleProgramCompletion } from '@/lib/workflows/careerOS';
import { MemberLifecycleWriteError } from '@/lib/member/activeWrite';

const tx = {
  memberNextBestAction: { create: mocks.createAction, updateMany: mocks.updateActions },
  memberEvent: { create: vi.fn() },
  workflowDiagnostic: { create: vi.fn() },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findAction.mockResolvedValue(null);
  mocks.findEvent.mockResolvedValue(null);
  mocks.createAction.mockResolvedValue({ id: 'action-1' });
  mocks.updateActions.mockResolvedValue({ count: 0 });
  mocks.bullet.mockResolvedValue('Synthetic resume bullet');
  mocks.jobMatch.mockResolvedValue(null);
  mocks.assignments.mockResolvedValue([]);
  mocks.activeWrite.mockImplementation(async (_id, write) => write(tx));
});

it('discards a prepared learning action when erasure starts during AI work', async () => {
  let guardedCalls = 0;
  mocks.activeWrite.mockImplementation(async (_id, write) => {
    if (++guardedCalls === 2) throw new MemberLifecycleWriteError();
    return write(tx);
  });

  const result = await handleLearningCompletion('member-1', 'Synthetic course');
  expect(mocks.bullet).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ actionId: null, created: false });
  expect(mocks.createAction).not.toHaveBeenCalled();
  expect(mocks.event).not.toHaveBeenCalled();
  expect(mocks.diagnostic).toHaveBeenCalledTimes(1); // Only the pre-erasure start record.
});

it('skips program completion writes and notifications for an erased member', async () => {
  mocks.activeWrite.mockRejectedValueOnce(new MemberLifecycleWriteError());
  const result = await handleProgramCompletion('member-1', 'synthetic-program', 'Synthetic program');
  expect(result).toEqual({ created: false, actionId: null });
  expect(mocks.createAction).not.toHaveBeenCalled();
  expect(mocks.event).not.toHaveBeenCalled();
  expect(mocks.notification).not.toHaveBeenCalled();
});

it('creates a learning action while the member stays active', async () => {
  const result = await handleLearningCompletion('member-1', 'Synthetic course');
  expect(result).toMatchObject({ actionId: 'action-1', created: true });
  expect(mocks.createAction).toHaveBeenCalledOnce();
  expect(mocks.event).toHaveBeenCalledOnce();
  expect(mocks.diagnostic).toHaveBeenCalledTimes(2);
});
