import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMemberResumePlainText: vi.fn(),
  getMemberState: vi.fn(),
  findAiResult: vi.fn(),
}));

vi.mock('@/lib/member/getMemberResumePlainText', () => ({
  getMemberResumePlainText: mocks.getMemberResumePlainText,
}));
vi.mock('@/lib/member/getMemberState', () => ({
  getMemberState: mocks.getMemberState,
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { aIToolResult: { findFirst: mocks.findAiResult } },
}));

import { prefillResumeRewriter } from '@/lib/ai/prefillFromMemberState';

describe('Resume Rewriter source prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMemberState.mockResolvedValue({ inferredTargetRole: 'Database administrator' });
  });

  it('uses a readable original resume as its source', async () => {
    const original = 'Jordan Candidate\nExperience\nMaintained SQL backups and restored production databases.';
    mocks.getMemberResumePlainText.mockResolvedValue(original);

    await expect(prefillResumeRewriter('member-1')).resolves.toEqual({
      ok: true,
      resume: original,
      jobTarget: 'Database administrator',
      framework: 'auto',
    });
    expect(mocks.getMemberResumePlainText).toHaveBeenCalledWith('member-1', 12000, { originalOnly: true });
    expect(mocks.findAiResult).not.toHaveBeenCalled();
  });

  it('fails closed when no original is readable even if an AI analysis exists', async () => {
    mocks.getMemberResumePlainText.mockResolvedValue('');
    mocks.findAiResult.mockResolvedValue({
      output: 'AI analysis falsely describing experience and credentials that were not in the source.',
    });

    await expect(prefillResumeRewriter('member-1')).resolves.toEqual({
      ok: false,
      error: 'We could not read an original resume. Paste it into the Resume Rewriter text box or upload a readable file.',
    });
    expect(mocks.getMemberResumePlainText).toHaveBeenCalledWith('member-1', 12000, { originalOnly: true });
    expect(mocks.findAiResult).not.toHaveBeenCalled();
    expect(mocks.getMemberState).not.toHaveBeenCalled();
  });
});
