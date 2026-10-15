// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicInquiryStore } from '@/tests/fixtures/publicInquiryStore';

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), send: vi.fn(), getResend: vi.fn(), log: vi.fn(), org: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { publicInquiry: { upsert: mocks.upsert, findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock('@/lib/tenant/resolveOrgFromRequest', () => ({ resolveOrgFromRequest: mocks.org }));
vi.mock('@/lib/email', () => ({ getResend: mocks.getResend }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send }));
vi.mock('@/lib/email/sendLog', () => ({ prismaEmailSendLogStore: { record: mocks.log } }));

import { submitPublicInquiry } from '@/lib/publicInquiries/submit';
import type { PublicInquiryInput } from '@/lib/publicInquiries/validation';

const input: PublicInquiryInput = { kind: 'contact', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.net', topic: 'My private topic', message: 'Please contact me about programs.', smsPreferred: false, submissionId: '9396e6d4-bc67-4b5b-9f49-d86798eeb9da' };
let store: ReturnType<typeof publicInquiryStore>;

beforeEach(() => {
  vi.clearAllMocks();
  store = publicInquiryStore();
  mocks.upsert.mockImplementation(store.upsert);
  mocks.updateMany.mockImplementation(store.updateMany);
  mocks.org.mockResolvedValue('org-a');
  mocks.getResend.mockReturnValue({});
  mocks.send.mockResolvedValue({ data: { id: 'provider-1' } });
});

describe('durable public inquiries', () => {
  it('persists the bounded receipt before notification and records provider acceptance separately', async () => {
    mocks.send.mockImplementation(async () => {
      expect(store.rows.size).toBe(1);
      expect([...store.rows.values()][0].notificationStatus).toBe('pending');
      return { data: { id: 'provider-1' } };
    });
    await expect(submitPublicInquiry(new Headers(), input)).resolves.toEqual({ ok: true });
    expect([...store.rows.values()][0]).toMatchObject({ organizationId: 'org-a', notificationStatus: 'accepted', notificationAttempts: 1, message: input.message });
    expect(mocks.upsert.mock.calls[0][0].where.organizationId).toBe('org-a');
    expect(mocks.updateMany.mock.calls.every(([args]) => args.where.organizationId === 'org-a')).toBe(true);
  });

  it('retains an inquiry with unavailable email configuration and retries the same receipt/key', async () => {
    mocks.getResend.mockReturnValue(null);
    await expect(submitPublicInquiry(new Headers(), input)).resolves.toMatchObject({ ok: false, status: 503, saved: true, receiptId: 'inquiry-1' });
    expect([...store.rows.values()][0].notificationStatus).toBe('unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.getResend.mockReturnValue({});
    await expect(submitPublicInquiry(new Headers(), { ...input, turnstileToken: 'fresh-token' })).resolves.toEqual({ ok: true });
    expect(store.rows.size).toBe(1);
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toBe('public-inquiry/inquiry-1');
  });

  it('keeps failed notification bodies available and does not resend an accepted retry', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Provider failure with private details'));
    await expect(submitPublicInquiry(new Headers(), input)).resolves.toMatchObject({ status: 500, saved: true });
    expect([...store.rows.values()][0]).toMatchObject({ notificationStatus: 'failed', message: input.message });
    await submitPublicInquiry(new Headers(), input);
    await submitPublicInquiry(new Headers(), input);
    expect(store.rows.size).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map((call) => call[1].idempotencyKey)).toEqual(['public-inquiry/inquiry-1', 'public-inquiry/inquiry-1']);
  });

  it('does not notify if capture fails, or overwrite a reused reference with changed content', async () => {
    mocks.upsert.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(submitPublicInquiry(new Headers(), input)).rejects.toThrow('database unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
    await submitPublicInquiry(new Headers(), input);
    await expect(submitPublicInquiry(new Headers(), { ...input, message: 'Changed content' })).resolves.toMatchObject({ status: 409 });
    expect([...store.rows.values()][0].message).toBe(input.message);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('isolates identical submission keys across tenants and never places lead PII in notification logs', async () => {
    await submitPublicInquiry(new Headers(), input);
    mocks.org.mockResolvedValue('org-b');
    await submitPublicInquiry(new Headers(), input);
    expect(store.rows.size).toBe(2);
    const [, args, options] = mocks.send.mock.calls[0];
    expect(args).toMatchObject({ subject: 'New public contact inquiry', entityType: 'public_inquiry', entityId: 'inquiry-1' });
    expect(args.template).toBeUndefined();
    await options.sendLogStore.record({ failureReason: input.email, failureClass: 'validation_error' });
    expect(mocks.log).toHaveBeenCalledWith({ failureReason: 'validation_error', failureClass: 'validation_error' });
    expect(options.suppressFailureDiagnostic).toBe(true);
  });

  it('deduplicates same-day legacy payloads while excluding CAPTCHA tokens', async () => {
    await submitPublicInquiry(new Headers(), { ...input, submissionId: undefined, turnstileToken: 'one' });
    await submitPublicInquiry(new Headers(), { ...input, submissionId: undefined, turnstileToken: 'two' });
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0].submissionKey).toMatch(/^legacy\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}$/);
  });

  it('recovers an emulated-upsert uniqueness race through a scoped receipt read', async () => {
    await submitPublicInquiry(new Headers(), input);
    mocks.upsert.mockRejectedValueOnce({ code: 'P2002' });
    mocks.findUnique.mockResolvedValueOnce([...store.rows.values()][0]);
    await expect(submitPublicInquiry(new Headers(), input)).resolves.toEqual({ ok: true });
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { organizationId: 'org-a', organizationId_submissionKey: { organizationId: 'org-a', submissionKey: input.submissionId } } });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('preserves known provider acceptance when a concurrent duplicate send fails later', async () => {
    let accept!: (result: unknown) => void;
    let fail!: (reason: Error) => void;
    mocks.send.mockImplementationOnce(() => new Promise((resolve) => { accept = resolve; }));
    mocks.send.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const first = submitPublicInquiry(new Headers(), input);
    const second = submitPublicInquiry(new Headers(), input);
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    accept({ data: { id: 'provider-1' } });
    await first;
    fail(new Error('Ambiguous later provider failure'));
    await second;
    expect([...store.rows.values()][0].notificationStatus).toBe('accepted');
  });

  it('still reports a retained receipt when notification status persistence becomes unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getResend.mockReturnValue(null);
    mocks.updateMany.mockRejectedValueOnce(new Error('status store unavailable'));
    await expect(submitPublicInquiry(new Headers(), input)).resolves.toMatchObject({ status: 503, saved: true, receiptId: 'inquiry-1' });
    expect(store.rows.size).toBe(1);
    expect(log).toHaveBeenCalledWith('Public inquiry notification status unavailable', { inquiryId: 'inquiry-1' });
    log.mockRestore();
  });
});
