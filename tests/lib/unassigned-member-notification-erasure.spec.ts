// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  counselors: vi.fn(),
  begin: vi.fn(),
  release: vi.fn(),
  mark: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
  discord: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    counselor: { findMany: mocks.counselors },
    notification: { create: mocks.create },
  },
}));
vi.mock('@/lib/counselor/autoAssign', () => ({ WAP_STAFF_COUNSELOR_AFFILIATION: 'staff' }));
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

import { notifyUnassignedMemberMessage } from '@/lib/messages/unassignedNotify';
import { MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

const input = {
  memberId: 'member-1',
  organizationId: 'org-1',
  threadId: 'thread-1',
  senderLabel: 'Synthetic Member',
  messagePreview: 'Synthetic private message',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.counselors.mockResolvedValue([{ userId: 'counselor-1' }, { userId: 'counselor-2' }]);
  mocks.create.mockResolvedValue({ id: 'notification-1' });
  mocks.push.mockResolvedValue(1);
  mocks.discord.mockResolvedValue(undefined);
  mocks.release.mockResolvedValue(undefined);
});

it('suppresses a stale staff message after member erasure wins the claim', async () => {
  mocks.begin.mockRejectedValue(new MemberUploadLifecycleError());

  await notifyUnassignedMemberMessage(input);

  expect(mocks.begin).toHaveBeenCalledTimes(2);
  expect(mocks.begin).toHaveBeenCalledWith('member-1', 'notification');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.discord).not.toHaveBeenCalled();
});

it('delivers to both staff recipients without overlapping claims for one member', async () => {
  let serial = 0;
  mocks.begin.mockImplementation(async () => {
    return `claim-${++serial}`;
  });

  await notifyUnassignedMemberMessage(input);

  expect(mocks.create.mock.calls.map(([call]) => call.data.userId)).toEqual(['counselor-1', 'counselor-2']);
  expect(mocks.release.mock.calls).toEqual([
    ['member-1', 'claim-1'],
    ['counselor-1', 'claim-2'],
    ['member-1', 'claim-3'],
    ['counselor-2', 'claim-4'],
  ]);
});
