import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrainingBillingPacket } from '@prisma/client';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({
  sendBrandedEmailOrThrowOnSkip: mocks.send,
  FixtureRecipientSkippedError: class FixtureRecipientSkippedError extends Error {},
}));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: (a: { branding: { name: string } }) => `layout:${a.branding.name}` }));

import { buildPacketEmail, classifyDeliveryError, deliverPacketEmail, DeliveryTimeoutError, EmailNotConfiguredError } from '@/lib/billing/sendPacket';
import type { SignedPacketSnapshot } from '@/lib/billing/packetSnapshot';
import type { SendAttemptRecord } from '@/lib/billing/sendAttempts';
import { getTrainingProviderIdentity } from '@/lib/billing/providerIdentity';

// Synthetic packet; nothing leaves the process (the sender is mocked).
const snapshot: SignedPacketSnapshot = {
  version: 1,
  provider: getTrainingProviderIdentity(),
  member: { fullName: 'Frozen Member', email: 'frozen@example.test' },
  programSlug: 'it-support-professional-certificate-ibm',
  programTitle: 'Frozen Program',
  counselor: { userId: 'c1', fullName: 'Frozen Counselor', email: 'counselor@example.test' },
  logo: null,
  pricing: { source: 'syllabus', priceListMaximum: null },
  fundingAttestation: { fundingBasis: 'wioa_ita', approvedAmount: 1300, reference: 'TEST-ITA-1', reviewed: true, tuitionMatches: true, staffNotedExceptionUnverified: null, reviewedFingerprint: '0123456789abcdef' },
  j6: { facts: ['Total due: $1,300.00'], narrative: 'Narrative.', factsReviewed: true },
  warnings: [],
};
const packet = {
  id: 'p1', organizationId: 'org', memberId: 'm1', programSlug: snapshot.programSlug, packetNumber: 'WAP-2026-0001', status: 'signed',
  invoiceDate: new Date('2026-09-04T00:00:00Z'), dueDate: null, billToName: 'Test Board', billToAttention: null, billToAddress: null, billToEmail: null,
  referenceNumber: null, lineItems: [{ description: 'Intro', hours: 10, amount: 1300 }], totalAmount: 1300, coverLetterBody: 'Narrative.',
  signerName: 'Test Signer', signerTitle: 'Test Title', signatureImage: null, signedAt: new Date('2026-09-04T01:00:00Z'), signedById: 'a1',
  sentAt: null, sentTo: [], sendCount: 0, signedSnapshot: snapshot, sendAttemptNo: 1, sendAttempt: null, fundingAttestationKey: 'wioa_ita:TESTITA1',
  supersededAt: null, supersededById: null, supersededReason: null, supersededByPacketId: null, supersedesPacketId: null,
  createdAt: new Date(), updatedAt: new Date(),
} as unknown as TrainingBillingPacket;
const attempt: SendAttemptRecord = {
  attemptNo: 1, recipients: ['student', 'counselor'], startedAt: '2026-09-26T00:00:00.000Z', startedById: 'a1', from: 'Frozen From <from@example.test>',
  branding: { orgId: 'org', name: 'Frozen Brand', logoUrl: '', primaryColor: '#111111', supportEmail: '', domain: 'https://x.test', domainLabel: 'x.test' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ data: { id: 'x' }, error: null });
});

describe('packet emails', () => {
  it('builds each copy only from the snapshot and the attempt', async () => {
    const student = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'student' });
    expect(student).toMatchObject({ to: 'frozen@example.test', from: 'Frozen From <from@example.test>', replyTo: snapshot.provider.email, html: 'layout:Frozen Brand' });
    const counselor = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'counselor' });
    expect(counselor).toMatchObject({ to: 'counselor@example.test' });
    expect(counselor).not.toHaveProperty('cc');
    expect(counselor.attachments.map((a) => a.filename)).toEqual(['J5-training-invoice-WAP-2026-0001-frozen-member.pdf', 'J6-cover-letter-WAP-2026-0001-frozen-member.pdf']);
  });

  it('builds a byte-identical payload on every retry', async () => {
    const a = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'counselor' });
    process.env.EMAIL_FROM = 'changed@example.test';
    const b = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'counselor' });
    delete process.env.EMAIL_FROM;
    expect(b).toEqual(a);
  });

  it('passes the idempotency key through to the mail wrapper', async () => {
    const email = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'student' });
    await deliverPacketEmail(email, 'billing-packet:p1:1:student');
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toBe('billing-packet:p1:1:student');
  });

  it('bounds the provider call: a timeout is ambiguous, and the late result is handed on, not dropped', async () => {
    let resolve!: (v: unknown) => void;
    mocks.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const email = await buildPacketEmail({ packet, snapshot, attempt, recipient: 'student' });
    const late: Array<{ delivered: boolean }> = [];
    const err = await deliverPacketEmail(email, 'k', { timeoutMs: 10, onLateResult: (o) => late.push(o) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeliveryTimeoutError);
    expect(classifyDeliveryError(err)).toBe('ambiguous');
    resolve({ data: { id: 'x' }, error: null });
    await new Promise((r) => setTimeout(r, 5));
    expect(late).toEqual([{ delivered: true, detail: 'provider accepted after the timeout', messageId: 'x' }]);
  });

  it('classifies provider outcomes: idempotency conflict, definite rejection, ambiguous', () => {
    const named = (name: string) => Object.assign(new Error(name), { providerErrorName: name });
    expect(classifyDeliveryError(named('invalid_idempotent_request'))).toBe('idempotency_conflict');
    for (const name of ['validation_error', 'invalid_parameter', 'missing_required_field', 'invalid_from_address']) {
      expect(classifyDeliveryError(named(name))).toBe('rejected_definite');
    }
    expect(classifyDeliveryError(new EmailNotConfiguredError())).toBe('rejected_definite');
    for (const err of [named('rate_limit_exceeded'), named('internal_server_error'), named('application_error'), named('concurrent_idempotent_requests'), new Error('ETIMEDOUT'), 'weird']) {
      expect(classifyDeliveryError(err)).toBe('ambiguous');
    }
  });
});
