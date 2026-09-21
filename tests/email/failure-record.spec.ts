/**
 * WAP-163: every failed send is recorded with a typed, queryable record
 * (template, params, error class, retryable, recipient hash) instead of
 * `{ to, subject }` alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';

vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/email/unsubscribeToken', () => ({ buildUnsubscribeUrl: () => 'https://www.workforceap.org/api/unsubscribe?t=x' }));

import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { sendBrandedEmail } from '@/lib/email/send';
import {
  EMAIL_SEND_WORKFLOW,
  EMAIL_TEMPLATE_ENTITY_TYPE,
  buildEmailFailureMetadata,
  classifyEmailSendFailure,
  parseEmailFailureMetadata,
  recipientDomain,
  recipientHash,
} from '@/lib/email/failureRecord';

const CRLF = 'Header keys and values cannot contain carriage return, line feed, or null characters';

describe('classifyEmailSendFailure', () => {
  it('classes the historical CRLF header bug as a fixed, retryable defect', () => {
    expect(classifyEmailSendFailure(new Error(CRLF))).toEqual({ errorClass: 'header_invalid', retryable: true });
  });

  it('classes provider rate limits as retryable', () => {
    expect(classifyEmailSendFailure({ statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' }))
      .toEqual({ errorClass: 'rate_limit', retryable: true });
  });

  it('classes 4xx validation rejections as permanent', () => {
    expect(classifyEmailSendFailure({ statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' }))
      .toEqual({ errorClass: 'provider_rejected', retryable: false });
    expect(classifyEmailSendFailure({ name: 'validation_error', message: 'The `to` address is not valid' }).retryable).toBe(false);
  });

  it('classes 5xx and network failures as retryable', () => {
    expect(classifyEmailSendFailure({ statusCode: 500, name: 'application_error', message: 'boom' }))
      .toEqual({ errorClass: 'provider_unavailable', retryable: true });
    expect(classifyEmailSendFailure(new TypeError('fetch failed'))).toEqual({ errorClass: 'network', retryable: true });
  });

  it('falls back to unknown/retryable for anything else', () => {
    expect(classifyEmailSendFailure('Send threw')).toEqual({ errorClass: 'unknown', retryable: true });
    expect(classifyEmailSendFailure(null)).toEqual({ errorClass: 'unknown', retryable: true });
  });
});

describe('buildEmailFailureMetadata / parseEmailFailureMetadata', () => {
  const now = new Date('2026-09-20T12:00:00Z');

  it('stores template and params so the row is replayable, and hashes the recipient', () => {
    const meta = buildEmailFailureMetadata(
      { to: 'Ada@Example.org', subject: 'Hello', template: { name: 'applicant_followup', params: { to: 'Ada@Example.org', fullName: 'Ada' } } },
      new Error(CRLF),
      now,
    );
    expect(meta).toMatchObject({
      to: [],
      subject: '',
      recipientDomain: 'example.org',
      template: 'applicant_followup',
      templateParams: { to: 'Ada@Example.org', fullName: 'Ada' },
      errorClass: 'header_invalid',
      retryable: true,
      resendable: true,
      failedAt: '2026-09-20T12:00:00.000Z',
    });
    expect(meta.recipientHash).toBe(recipientHash('ada@example.org'));
    expect(meta.recipientHash).toHaveLength(16);
    expect(meta.recipientHash).not.toContain('example');
    // The raw address and subject are never written; templateParams is the
    // resend payload and is the only place the address may remain.
    expect(JSON.stringify({ ...meta, templateParams: undefined })).not.toContain('Ada@Example.org');
    expect(JSON.stringify(meta)).not.toContain('Hello');
  });

  it('marks a send without a template as not resendable and stores no params', () => {
    const meta = buildEmailFailureMetadata({ to: ['a@example.org', 'b@example.org'], subject: 'Reset' }, new Error('x'), now);
    expect(meta.template).toBeNull();
    expect(meta.resendable).toBe(false);
    expect('templateParams' in meta).toBe(false);
    expect(meta.to).toEqual([]);
    expect(meta.recipientHash).toBe(recipientHash('a@example.org'));
    expect(meta.recipientDomain).toBe('example.org');
    expect(JSON.stringify(meta)).not.toContain('a@example.org');
  });

  it('derives the recipient domain for legacy rows and never from an empty address', () => {
    expect(recipientDomain('Ada@Example.org')).toBe('example.org');
    expect(recipientDomain(['first@one.org', 'second@two.org'])).toBe('one.org');
    expect(recipientDomain('not-an-address')).toBeNull();
    expect(recipientDomain(undefined)).toBeNull();
    expect(parseEmailFailureMetadata({ to: ['x@example.org'], subject: 'We Miss You' }).recipientDomain).toBe('example.org');
  });

  it('round-trips through JSON and reads legacy rows as non-resendable unknown failures', () => {
    const meta = buildEmailFailureMetadata(
      { to: 'a@example.org', subject: 'S', template: { name: 'course_kickoff', params: { to: 'a@example.org', fullName: 'A', programName: 'P' } } },
      { statusCode: 500, message: 'down' },
      now,
    );
    const parsed = parseEmailFailureMetadata(JSON.parse(JSON.stringify(meta)));
    expect(parsed).toEqual(meta);

    const legacy = parseEmailFailureMetadata({ to: ['x@example.org'], subject: 'We Miss You' });
    expect(legacy).toMatchObject({ to: ['x@example.org'], subject: 'We Miss You', template: null, errorClass: 'unknown', retryable: true, resendable: false, recipientDomain: 'example.org' });
    expect(parseEmailFailureMetadata(null).to).toEqual([]);
    expect(parseEmailFailureMetadata({ resentAt: '2026-09-21T00:00:00.000Z', resentOk: true, resentDiagnosticId: 'd2' }))
      .toMatchObject({ resentAt: '2026-09-21T00:00:00.000Z', resentOk: true, resentDiagnosticId: 'd2' });
  });
});

describe('sendBrandedEmail failure diagnostic', () => {
  const noSleep = { sleep: async () => {}, now: () => 0, random: () => 0 };
  const fakeResend = (send: (...args: unknown[]) => unknown) => ({ emails: { send: vi.fn(send) } }) as unknown as Resend;

  beforeEach(() => vi.clearAllMocks());

  it('records template, params, class and retryable when the SDK throws', async () => {
    const resend = fakeResend(async () => { throw new Error(CRLF); });
    await expect(sendBrandedEmail(resend, {
      from: 'WorkforceAP <hello@workforceap.org>',
      to: 'ada@example.org',
      subject: 'Your WorkforceAP Application is Being Reviewed',
      html: '<p>Hi</p>',
      template: { name: 'applicant_followup', params: { to: 'ada@example.org', fullName: 'Ada Lovelace' } },
    }, noSleep)).rejects.toThrow(CRLF);

    expect(recordWorkflowDiagnostic).toHaveBeenCalledTimes(1);
    const row = vi.mocked(recordWorkflowDiagnostic).mock.calls[0][0];
    expect(row).toMatchObject({
      workflow: EMAIL_SEND_WORKFLOW,
      status: 'error',
      entityType: EMAIL_TEMPLATE_ENTITY_TYPE,
      entityId: 'applicant_followup',
      provider: 'resend',
      failureReason: CRLF,
    });
    expect(row.summary).toBe('Email send failed: applicant_followup (header_invalid)');
    expect(row.summary).not.toContain('Being Reviewed');
    expect(row.metadata).toMatchObject({
      to: [],
      recipientHash: recipientHash('ada@example.org'),
      recipientDomain: 'example.org',
      template: 'applicant_followup',
      templateParams: { to: 'ada@example.org', fullName: 'Ada Lovelace' },
      errorClass: 'header_invalid',
      retryable: true,
      resendable: true,
    });
    expect(typeof row.metadata?.failedAt).toBe('string');
  });

  it('records a permanent rejection from a { data, error } response as not retryable', async () => {
    const resend = fakeResend(async () => ({ data: null, error: { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' } }));
    await expect(sendBrandedEmail(resend, { from: 'a@workforceap.org', to: 'nobody@example.org', subject: 'S', html: '<p>x</p>' }, noSleep))
      .rejects.toThrow('Invalid `to` field');
    const row = vi.mocked(recordWorkflowDiagnostic).mock.calls[0][0];
    expect(row.entityId).toBeNull();
    expect(row.metadata).toMatchObject({ template: null, errorClass: 'provider_rejected', retryable: false, resendable: false });
    expect(row.metadata).not.toHaveProperty('templateParams');
  });

  it('writes nothing on success and nothing when the caller owns the diagnostic', async () => {
    const ok = fakeResend(async () => ({ data: { id: 'msg' }, error: null }));
    await sendBrandedEmail(ok, { from: 'a@workforceap.org', to: 'b@example.org', subject: 'S', html: '<p>x</p>' }, noSleep);
    const failing = fakeResend(async () => { throw new Error('boom'); });
    await expect(sendBrandedEmail(failing, { from: 'a@workforceap.org', to: 'b@example.org', subject: 'S', html: '<p>x</p>' }, { ...noSleep, suppressFailureDiagnostic: true }))
      .rejects.toThrow('boom');
    expect(recordWorkflowDiagnostic).not.toHaveBeenCalled();
  });
});
