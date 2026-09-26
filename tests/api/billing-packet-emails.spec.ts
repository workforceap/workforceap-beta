import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrainingBillingPacket } from '@prisma/client';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send }));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: (a: { branding: { name: string } }) => `layout:${a.branding.name}` }));

import { buildPacketEmail, deliverPacketEmail, isIdempotencyConflict } from '@/lib/billing/sendPacket';
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
  sentAt: null, sentTo: [], sendCount: 0, signedSnapshot: snapshot, sendAttemptNo: 1, sendAttempt: null, fundingAttestationKey: 'wioa_ita:test-ita-1',
  createdAt: new Date(), updatedAt: new Date(),
} as unknown as TrainingBillingPacket;
const attempt: SendAttemptRecord = {
  attemptNo: 1, startedAt: '2026-09-26T00:00:00.000Z', startedById: 'a1', from: 'Frozen From <from@example.test>',
  branding: { orgId: 'org', name: 'Frozen Brand', logoUrl: '', primaryColor: '#111111', supportEmail: '', domain: 'https://x.test', domainLabel: 'x.test' },
  ccEmail: 'admin@example.test',
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
    expect(counselor).toMatchObject({ to: 'counselor@example.test', cc: 'admin@example.test' });
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

  it('recognizes a Resend idempotency conflict', () => {
    expect(isIdempotencyConflict(Object.assign(new Error('x'), { providerErrorName: 'invalid_idempotent_request' }))).toBe(true);
    expect(isIdempotencyConflict(Object.assign(new Error('x'), { statusCode: 409 }))).toBe(true);
    expect(isIdempotencyConflict(new Error('timeout'))).toBe(false);
  });
});
