// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  send: vi.fn(),
  upsertLog: vi.fn(),
}));

vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findUnique: mocks.findUser },
  emailSendLog: { upsert: mocks.upsertLog },
} }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));
// These tests exercise the final address/lifecycle lookup. Claim acquisition
// and settlement are covered separately by member-effect-claim.spec.ts.
vi.mock('@/lib/member/uploadLifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/member/uploadLifecycle')>()),
  beginMemberUpload: vi.fn(async () => 'synthetic-email-claim'),
  releaseMemberUpload: vi.fn(async () => undefined),
  markMemberExternalEffectUncertain: vi.fn(async () => undefined),
}));

import {
  sendCourseCompletedEmail,
  sendElevatorSpeechEmail,
  sendEligibilityScreeningConfirmationEmail,
  sendInactiveNudgeEmail,
  sendInterviewPrepBundleEmail,
  sendPreparedPlacementSurveyEmail,
  sendVoiceCoachArtifactEmail,
  sendVoiceCoachTranscriptEmail,
  sendVoiceInterviewTranscriptEmail,
} from '@/lib/email';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-only');
  vi.stubEnv('CRON_SECRET', 'synthetic-unsubscribe-only');
  mocks.send.mockResolvedValue({ data: { id: 'synthetic-receipt' }, error: null });
  mocks.upsertLog.mockResolvedValue({});
});

afterEach(() => vi.unstubAllEnvs());

describe('queued member cron email lifecycle', () => {
  it('drops a stale nudge when the member was erased after the cron read its batch', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'erased@workforceap.org',
      deletedAt: new Date(),
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
    });

    const result = await sendInactiveNudgeEmail({
      to: 'erased@workforceap.org',
      recipientUserId: 'member-1',
      fullName: 'Erased Member',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-1' } }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('drops a frozen survey payload when deletion is pending, without changing the provider payload', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'member@workforceap.org',
      deletedAt: null,
      billingDeletionPendingAt: new Date(),
      billingDeletionOperationId: null,
    });
    const payload = {
      from: 'WorkforceAP <hello@workforceap.org>',
      to: 'member@workforceap.org',
      subject: 'Your placement survey',
      html: '<p>Complete your survey</p>',
      text: 'Complete your survey',
      headers: {},
      idempotencyKey: 'placement-survey/frozen/1',
    };

    const result = await sendPreparedPlacementSurveyEmail(payload, 'member-2');

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(payload).not.toHaveProperty('recipientUserId');
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-2' } }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('drops an old queued address after the member changes email', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'new@workforceap.org',
      deletedAt: null,
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
    });

    const result = await sendInactiveNudgeEmail({
      to: 'old@workforceap.org',
      recipientUserId: 'member-3',
      fullName: 'Active Member',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('member-addressed email lifecycle', () => {
  const memberEmail = 'member@workforceap.org';
  const member = {
    email: memberEmail,
    deletedAt: null,
    billingDeletionPendingAt: null,
    billingDeletionOperationId: null,
  };

  it('skips course completion after erasure before the provider sees the stale address', async () => {
    mocks.findUser.mockResolvedValue({ ...member, deletedAt: new Date() });

    const result = await sendCourseCompletedEmail({
      to: memberEmail,
      recipientUserId: 'member-course',
      fullName: 'Fixture Member',
      courseName: 'Synthetic course',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-course' } }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips the prep bundle when the member changes email after the bundle was fetched', async () => {
    mocks.findUser.mockResolvedValue({ ...member, email: 'new@workforceap.org' });

    const result = await sendInterviewPrepBundleEmail({
      to: memberEmail,
      recipientUserId: 'member-prep',
      memberName: 'Fixture Member',
      bundle: { items: [], generatedAt: new Date() },
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips account eligibility confirmation while deletion is pending', async () => {
    mocks.findUser.mockResolvedValue({ ...member, billingDeletionPendingAt: new Date() });

    const result = await sendEligibilityScreeningConfirmationEmail({
      to: memberEmail,
      recipientUserId: 'member-eligibility',
      fullName: 'Fixture Member',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips elevator speech if the member was hard-deleted during generation', async () => {
    mocks.findUser.mockResolvedValue(null);

    const result = await sendElevatorSpeechEmail({
      to: memberEmail,
      recipientUserId: 'member-elevator',
      memberName: 'Fixture Member',
      targetRole: 'Synthetic role',
      pitch: 'A synthetic pitch.',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('allows the explicit public lead confirmation without a member identity', async () => {
    const result = await sendEligibilityScreeningConfirmationEmail({
      to: 'lead@partner.org',
      publicLead: true,
      fullName: 'Public Lead',
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});

describe('member content sent to staff', () => {
  const staffRecipient = ['staff@workforceap.org'];

  it('drops a queued coach transcript after a soft erase', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'erased@deleted.invalid',
      deletedAt: new Date(),
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
    });

    const result = await sendVoiceCoachTranscriptEmail({
      to: staffRecipient,
      subjectMemberId: 'member-coach',
      memberName: 'Original Name',
      memberEmail: 'original@workforceap.org',
      coachLabel: 'Resume Coach',
      transcriptTurns: [{ role: 'user', text: 'Private conversation' }],
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-coach' } }));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('drops a staff artifact using a stale Auth email after hard erasure', async () => {
    mocks.findUser.mockResolvedValue(null);

    const result = await sendVoiceCoachArtifactEmail({
      to: staffRecipient,
      subjectMemberId: 'member-artifact',
      memberName: 'Original Name',
      memberEmail: 'original@workforceap.org',
      coachLabel: 'Elevator Pitch Builder',
      artifactTitle: 'Pitch',
      artifactBody: 'Private pitch',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('drops a queued interview transcript when the member address changed', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'current@workforceap.org',
      deletedAt: null,
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
    });

    const result = await sendVoiceInterviewTranscriptEmail({
      to: staffRecipient,
      subjectMemberId: 'member-interview',
      memberName: 'Original Name',
      memberEmail: 'old@workforceap.org',
      role: 'Synthetic role',
      interviewType: 'Practice',
      transcriptTurns: [{ role: 'user', text: 'Private answer' }],
      sessionId: 'synthetic-session',
    });

    expect(result).toEqual({ ok: false, skipped: true, error: 'inactive_member' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('still delivers an active member artifact to staff', async () => {
    mocks.findUser.mockResolvedValue({
      email: 'member@workforceap.org',
      deletedAt: null,
      billingDeletionPendingAt: null,
      billingDeletionOperationId: null,
    });

    const result = await sendVoiceCoachArtifactEmail({
      to: staffRecipient,
      subjectMemberId: 'member-active',
      memberName: 'Active Member',
      memberEmail: 'member@workforceap.org',
      coachLabel: 'Elevator Pitch Builder',
      artifactTitle: 'Pitch',
      artifactBody: 'Synthetic pitch',
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
