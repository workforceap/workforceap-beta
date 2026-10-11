// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';

const mocks = vi.hoisted(() => ({ send: vi.fn(), upsert: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { emailSendLog: { upsert: mocks.upsert } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: vi.fn() }));
vi.mock('@/lib/email/unsubscribeToken', () => ({ buildUnsubscribeUrl: () => 'https://www.workforceap.org/api/unsubscribe?t=synthetic' }));

import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { sendEmployerPendingApplicantsEmail } from '@/lib/email';
import { sendBrandedEmail } from '@/lib/email/send';
import type { EmailSendLogEntry, EmailSendLogStore } from '@/lib/email/sendLog';

const args = {
  from: 'WorkforceAP <hello@workforceap.org>',
  to: 'synthetic-recipient@workforceap.org',
  subject: 'Synthetic receipt contract',
  html: '<p>Synthetic receipt contract</p>',
  templateKey: 'employer_pending_applicants',
  userId: 'synthetic-user',
};
const now = () => Date.parse('2026-10-11T02:00:00Z');
const resend = { emails: { send: mocks.send } } as unknown as Resend;

function captureStore() {
  const entries: EmailSendLogEntry[] = [];
  const store: EmailSendLogStore = {
    async record(entry) { entries.push({ ...entry }); },
  };
  return { entries, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  mocks.upsert.mockResolvedValue({});
  vi.stubEnv('RESEND_API_KEY', 'synthetic-provider-only');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network request'); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('provider acceptance receipt boundary', () => {
  it.each([
    { label: 'null data', response: { data: null, error: null } },
    { label: 'missing id', response: { data: {}, error: null } },
    { label: 'null id', response: { data: { id: null }, error: null } },
    { label: 'empty id', response: { data: { id: '' }, error: null } },
    { label: 'whitespace id', response: { data: { id: ' \t\n ' }, error: null } },
    { label: 'nonstring id', response: { data: { id: 42 }, error: null } },
    { label: 'missing envelope', response: undefined },
  ])('records $label as unknown and retryable, without claiming sent', async ({ response }) => {
    mocks.send.mockResolvedValue(response);
    const { entries, store } = captureStore();

    await expect(sendBrandedEmail(resend, args, { sendLogStore: store, now }))
      .rejects.toThrow('acceptance is unknown');

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(entries.map(entry => entry.status)).toEqual(['sending', 'failed']);
    expect(entries.at(-1)).toMatchObject({
      providerMessageId: null, sentAt: null, attempts: 1, failureClass: 'unknown',
      failureReason: expect.stringContaining('acceptance is unknown'),
    });
    expect(recordWorkflowDiagnostic).toHaveBeenCalledTimes(1);
    expect(recordWorkflowDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error', metadata: expect.objectContaining({ errorClass: 'unknown', retryable: true }),
    }));
  });

  it('returns a receipt and records sent only when the provider supplies a nonblank string id', async () => {
    const response = { data: { id: 'synthetic-provider-receipt' }, error: null };
    mocks.send.mockResolvedValue(response);
    const { entries, store } = captureStore();

    await expect(sendBrandedEmail(resend, args, { sendLogStore: store, now })).resolves.toBe(response);

    expect(entries.at(-1)).toMatchObject({ status: 'sent', providerMessageId: response.data.id, sentAt: new Date(now()), attempts: 1 });
    expect(recordWorkflowDiagnostic).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'caller-supplied', idempotencyKey: 'synthetic/stable-receipt-retry' },
    { label: 'generated', idempotencyKey: undefined },
  ])('keeps the identical payload and $label key across a later retry', async ({ idempotencyKey }) => {
    mocks.send.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: 'synthetic-retry-receipt' }, error: null });
    const { entries, store } = captureStore();
    const message = { ...args, idempotencyKey };
    const options = { sendLogStore: store, now, suppressFailureDiagnostic: true };

    await expect(sendBrandedEmail(resend, message, options)).rejects.toThrow('acceptance is unknown');
    await expect(sendBrandedEmail(resend, message, options)).resolves.toMatchObject({ data: { id: 'synthetic-retry-receipt' } });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
    expect(mocks.send.mock.calls[0][1]).toEqual({
      idempotencyKey: idempotencyKey ?? expect.stringMatching(/^employer_pending_applicants\/[0-9a-f]{64}$/),
    });
    expect(new Set(entries.map(entry => entry.dedupeKey)).size).toBe(1);
    expect(entries.map(entry => entry.status)).toEqual(['sending', 'failed', 'sending', 'sent']);
    expect(recordWorkflowDiagnostic).not.toHaveBeenCalled();
  });

  it('preserves a transient retry and records a subsequent missing receipt at its actual attempt count', async () => {
    mocks.send.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', message: 'Try later', retry_after: 0.1 } })
      .mockResolvedValue({ data: null, error: null });
    const { entries, store } = captureStore();
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(sendBrandedEmail(resend, { ...args, idempotencyKey: 'synthetic/transient-then-unknown' }, {
      sendLogStore: store, now, sleep, deadlineAtMs: now() + 1_000, consultSuppressions: false,
    })).rejects.toThrow('acceptance is unknown');

    expect(sleep).toHaveBeenCalledExactlyOnceWith(100);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
    expect(entries.at(-1)).toMatchObject({ status: 'failed', attempts: 2, failureClass: 'unknown', providerMessageId: null });
  });

  it('does not claim acceptance when an error is present even if the malformed response also has an id', async () => {
    mocks.send.mockResolvedValue({ data: { id: 'contradictory-id' }, error: { statusCode: 422, name: 'validation_error', message: 'Rejected payload' } });
    const { entries, store } = captureStore();

    await expect(sendBrandedEmail(resend, args, { sendLogStore: store, now })).rejects.toThrow('Rejected payload');

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(entries.at(-1)).toMatchObject({ status: 'failed', failureClass: 'provider_rejected', providerMessageId: null });
    expect(recordWorkflowDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ errorClass: 'provider_rejected', retryable: false }),
    }));
  });

  it('makes the real operational wrapper return ok:false and log failure for a missing receipt', async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendEmployerPendingApplicantsEmail({
      to: args.to, candidateCount: 2, jobsAffected: 1, oldestWaitingDays: 6,
    })).resolves.toEqual({ ok: false, error: expect.stringContaining('acceptance is unknown') });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls.at(-1)?.[0].create).toMatchObject({
      status: 'failed', providerMessageId: null, failureClass: 'unknown', sentAt: null,
    });
  });
});
