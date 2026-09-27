import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email/send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/send')>()),
  sendBrandedEmailOrThrowOnSkip: mocks.send,
}));

import { sendAIMatchSuggestionEmail, sendApplicationConfirmationEmail } from '@/lib/email';
import { FixtureRecipientSkippedError, MemberEmailOutcomeUncertainError } from '@/lib/email/send';

describe('member-linked email wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'synthetic-only');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reports an inactive named candidate as skipped instead of sent', async () => {
    mocks.send.mockRejectedValueOnce(new FixtureRecipientSkippedError('inactive_member'));

    const result = await sendAIMatchSuggestionEmail({
      to: 'employer@workforceap.org',
      jobTitle: 'Developer',
      companyName: 'Example',
      subjectMemberIds: ['member-1', 'member-2'],
      matches: [
        { name: 'Alice', program: 'Software', score: 91 },
        { name: 'Bob', program: 'Software', score: 88 },
      ],
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      subjectMemberIds: ['member-1', 'member-2'],
      memberEffectClaim: true,
    }));
  });

  it('reports an unknown employer provider outcome for reconciliation', async () => {
    mocks.send.mockRejectedValueOnce(new MemberEmailOutcomeUncertainError(new Error('provider timeout')));

    const result = await sendAIMatchSuggestionEmail({
      to: 'employer@workforceap.org',
      jobTitle: 'Developer',
      companyName: 'Example',
      subjectMemberIds: ['member-1'],
      matches: [{ name: 'Alice', program: 'Software', score: 91 }],
    });

    expect(result).toEqual({ ok: false, uncertain: true, error: 'Email provider outcome needs reconciliation' });
  });

  it('reports an erased applicant confirmation as skipped instead of sent', async () => {
    mocks.send.mockRejectedValueOnce(new FixtureRecipientSkippedError('inactive_member'));

    const result = await sendApplicationConfirmationEmail({
      to: 'member@workforceap.org',
      recipientUserId: 'member-1',
      fullName: 'Member One',
      applicationId: 'app-1',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      recipientUserId: 'member-1',
      memberEffectClaim: true,
    }));
  });
});
