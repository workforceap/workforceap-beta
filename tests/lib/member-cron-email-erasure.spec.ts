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

import { sendInactiveNudgeEmail, sendPreparedPlacementSurveyEmail } from '@/lib/email';

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
