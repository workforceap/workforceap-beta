import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email', () => ({ getResend: () => ({}) }));
vi.mock('@/lib/email/send', () => ({ sendBrandedEmailOrThrowOnSkip: mocks.send }));
vi.mock('@/lib/email/template', () => ({ brandedEmailLayout: () => '<html></html>' }));
vi.mock('@/lib/tenant/organizationBranding', () => ({ getOrganizationBranding: async () => ({ domain: 'https://portal.example.test' }) }));

import { sendBillingPacketEmails } from '@/lib/billing/sendPacket';

// Synthetic packet; nothing leaves the process (the email sender is mocked).
const packet = {
  id: 'd0000000-0000-4000-8000-000000000004',
  organizationId: 'org',
  memberId: 'm1',
  programSlug: 'it-support-professional-certificate-ibm',
  packetNumber: 'WAP-2026-0001',
  status: 'signed',
  invoiceDate: new Date('2026-09-04T00:00:00Z'),
  dueDate: null,
  billToName: 'Test Board',
  billToAttention: null,
  billToAddress: null,
  billToEmail: null,
  referenceNumber: null,
  lineItems: [{ description: 'Intro', hours: 10, amount: 1300 }],
  totalAmount: 1300,
  coverLetterBody: 'Body of the letter for testing.',
  signerName: 'Test Signer',
  signerTitle: 'Test Title',
  signatureImage: null,
  signedAt: new Date('2026-09-04T01:00:00Z'),
  signedById: 'a1',
  sentAt: null,
  sentTo: [] as string[],
  sendCount: 0,
  signedSnapshot: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const member = { id: 'm1', fullName: 'Test Member', email: 'member@example.test', organizationId: 'org' };
const counselor = { fullName: 'Test Counselor', email: 'counselor@example.test' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue(undefined);
});

describe('sendBillingPacketEmails', () => {
  it('sends the student copy first, then the counselor copy with the admin cc', async () => {
    const result = await sendBillingPacketEmails({ packet, member, counselor, ccEmail: 'admin@example.test' });
    expect(mocks.send.mock.calls.map((c) => c[1].to)).toEqual(['member@example.test', 'counselor@example.test']);
    expect(mocks.send.mock.calls[1][1].cc).toBe('admin@example.test');
    expect(result).toMatchObject({ studentSent: true, counselorSent: true, errors: [] });
  });

  it('does not tell the counselor the student has a copy when the student copy failed', async () => {
    mocks.send.mockRejectedValueOnce(new Error('bounced'));
    const result = await sendBillingPacketEmails({ packet, member, counselor, ccEmail: 'admin@example.test' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ sentTo: [], studentSent: false, counselorSent: false });
    expect(result.errors[0]).toMatch(/Student email failed: bounced/);
  });

  it('skips the student copy when retrying a send whose counselor copy failed', async () => {
    const result = await sendBillingPacketEmails({ packet, member, counselor, ccEmail: 'admin@example.test', studentAlreadySent: true });
    expect(mocks.send.mock.calls.map((c) => c[1].to)).toEqual(['counselor@example.test']);
    expect(result).toMatchObject({ studentSent: false, counselorSent: true, sentTo: ['counselor@example.test', 'admin@example.test'] });
  });
});
