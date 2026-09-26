import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { TrainingBillingPacket } from '@prisma/client';
import { packetToDocumentInput } from './packetDocument';
import { j6EnclosureLines } from './packetPdf';
import { buildSignedSnapshot, parseSignedSnapshot } from './packetSnapshot';
import { getTrainingProviderIdentity } from './providerIdentity';
import { buildDefaultLineItems, resolveProgramPricing } from './packetDefaults';
import { defaultCoverLetterBody, findCoverLetterMismatches } from './packetText';

// Synthetic test data only.
const FUNDING = { fundingType: 'wioa_ita' as const, approvedAmount: 1300, basis: 'TEST-ITA-0001', capException: '', reviewed: true as const };

function row(overrides: Partial<TrainingBillingPacket> = {}): TrainingBillingPacket {
  return {
    id: 'p1',
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
    sentTo: [],
    sendCount: 0,
    signedSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const ENV_KEYS = ['BILLING_PROVIDER_LEGAL_NAME', 'BILLING_PROVIDER_ADDRESS'] as const;
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('signed snapshot', () => {
  it('renders from the snapshot, not later member, program or provider edits', () => {
    const signedProvider = getTrainingProviderIdentity();
    const snapshot = buildSignedSnapshot({
      provider: signedProvider,
      member: { fullName: 'Name At Signing', email: 'signed@example.test' },
      programTitle: 'Title At Signing',
      counselorAssigned: false,
      pricing: { source: 'syllabus', defaultTotal: 7500 },
      fundingApproval: FUNDING,
    });
    // Edits after signing: provider env, member rename, program slug title.
    process.env.BILLING_PROVIDER_LEGAL_NAME = 'Renamed Provider';
    process.env.BILLING_PROVIDER_ADDRESS = '1 Moved St | Elsewhere, TX 00000';
    const input = packetToDocumentInput(
      row({ signedSnapshot: JSON.parse(JSON.stringify(snapshot)) }),
      { fullName: 'Renamed Member', email: 'new@example.test' },
      null,
    );
    assert.equal(input.provider.legalName, signedProvider.legalName);
    assert.deepEqual(input.provider.addressLines, signedProvider.addressLines);
    assert.deepEqual(input.member, { fullName: 'Name At Signing', email: 'signed@example.test' });
    assert.equal(input.programTitle, 'Title At Signing');
    assert.equal(input.counselorAssigned, false);
  });

  it('falls back to live values for a legacy row or a malformed snapshot', () => {
    process.env.BILLING_PROVIDER_LEGAL_NAME = 'Live Provider';
    for (const signedSnapshot of [null, { version: 1, provider: {}, member: {} }, 'garbage']) {
      const input = packetToDocumentInput(row({ signedSnapshot }), { fullName: 'Live Member', email: 'l@example.test' }, null);
      assert.equal(input.provider.legalName, 'Live Provider');
      assert.equal(input.member.fullName, 'Live Member');
      assert.equal(input.counselorAssigned, undefined);
    }
    assert.equal(parseSignedSnapshot({ version: 2 }), null);
  });
});

describe('J6 cc line', () => {
  it('names the counselor only when one was assigned at signing', () => {
    const base = packetToDocumentInput(row(), { fullName: 'Test Member', email: 't@example.test' }, null);
    assert.equal(j6EnclosureLines({ ...base, counselorAssigned: false })[1], 'cc: Test Member (participant)');
    assert.equal(j6EnclosureLines({ ...base, counselorAssigned: true })[1], 'cc: Test Member (participant); assigned career counselor');
    assert.equal(j6EnclosureLines(base)[1], 'cc: Test Member (participant); assigned career counselor');
  });
});

describe('findCoverLetterMismatches', () => {
  const pricing = resolveProgramPricing({ slug: 'x' }, { cost: 3000, certCost: 0, bookCost: 0, miscCost: 0 });
  const rows = buildDefaultLineItems({
    programTitle: 'Test Program',
    pricing,
    courses: [
      { name: 'Intro', estimatedHours: 10 },
      { name: 'Advanced', estimatedHours: 20 },
    ],
  });
  const letterFor = (lineItems = rows, billToName = 'Test Board', referenceNumber?: string) =>
    defaultCoverLetterBody({ memberName: 'Test Member', programTitle: 'Test Program', billToName, lineItems, providerName: 'Test Provider', referenceNumber });

  it('accepts the default letter for the same rows', () => {
    assert.deepEqual(findCoverLetterMismatches({ coverLetterBody: letterFor(), lineItems: rows, billToName: 'Test Board' }), []);
    assert.deepEqual(
      findCoverLetterMismatches({ coverLetterBody: letterFor(rows, 'Test Board', 'REF-1'), lineItems: rows, billToName: 'Test Board', referenceNumber: 'REF-1' }),
      [],
    );
  });

  it('flags a letter left over from rows that were edited afterwards', () => {
    const edited = [...rows, { description: 'Exam voucher', hours: null, amount: 300 }];
    const issues = findCoverLetterMismatches({ coverLetterBody: letterFor(), lineItems: edited, billToName: 'Test Board' });
    assert.equal(issues.length, 1);
    assert.match(issues[0], /\$3,000\.00.*\$3,300\.00/);
  });

  it('flags changed classes, hours, bill-to and reference', () => {
    const changed = [{ description: 'Intro', hours: 12, amount: 1000 }, { description: 'Advanced', hours: 20, amount: 2000 }];
    const issues = findCoverLetterMismatches({ coverLetterBody: letterFor(rows, 'Old Board', 'REF-1'), lineItems: changed, billToName: 'New Board', referenceNumber: 'REF-2' });
    assert.ok(issues.some((i) => /30 total contact hours.*32/.test(i)));
    assert.ok(issues.some((i) => /"Intro \(10 contact hours\)"/.test(i)));
    assert.ok(issues.some((i) => /"Intro" is missing/.test(i)));
    assert.ok(issues.some((i) => /billed to Old Board.*New Board/.test(i)));
    assert.ok(issues.some((i) => /reference REF-2/.test(i)));
  });

  it('accepts a hand-written letter that states no conflicting facts', () => {
    assert.deepEqual(findCoverLetterMismatches({ coverLetterBody: 'Please find the enclosed invoice for this participant.', lineItems: rows, billToName: 'Test Board' }), []);
  });
});
