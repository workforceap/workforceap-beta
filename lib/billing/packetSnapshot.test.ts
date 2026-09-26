import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { TrainingBillingPacket } from '@prisma/client';
import { packetToDocumentInput } from './packetDocument';
import { j6EnclosureLines, renderJ5InvoicePdf, renderJ6CoverLetterPdf } from './packetPdf';
import { freezeLogo, MAX_SNAPSHOT_LOGO_BYTES, parseSignedSnapshot, SignedSnapshotCorruptError, type SignedPacketSnapshot } from './packetSnapshot';
import { getTrainingProviderIdentity } from './providerIdentity';
import { checkBillingProviderOrg, getBillingProviderOrgId } from './providerOrg';
import { DEFAULT_ORG_ID } from '@/lib/tenant/organization';

// Synthetic test data only.
const LOGO = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

function snapshot(overrides: Partial<SignedPacketSnapshot> = {}): SignedPacketSnapshot {
  return {
    version: 1,
    provider: getTrainingProviderIdentity(),
    member: { fullName: 'Name At Signing', email: 'signed@example.test' },
    programSlug: 'it-support-professional-certificate-ibm',
    programTitle: 'Title At Signing',
    counselor: null,
    logo: freezeLogo(LOGO),
    pricing: { source: 'syllabus', priceListMaximum: null },
    fundingAttestation: {
      fundingBasis: 'wioa_ita',
      approvedAmount: 1300,
      reference: 'TEST-ITA-0001',
      reviewed: true,
      tuitionMatches: true,
      staffNotedExceptionUnverified: null,
      reviewedFingerprint: '0123456789abcdef',
    },
    j6: { facts: ['Billed to: Test Board', 'Total due: $1,300.00'], narrative: 'Narrative at signing.', factsReviewed: true },
    warnings: [],
    ...overrides,
  };
}

function row(overrides: Partial<TrainingBillingPacket> = {}): TrainingBillingPacket {
  return {
    id: 'p1',
    organizationId: DEFAULT_ORG_ID,
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
    coverLetterBody: 'Narrative at signing.',
    signerName: 'Test Signer',
    signerTitle: 'Test Title',
    signatureImage: null,
    signedAt: new Date('2026-09-04T01:00:00Z'),
    signedById: 'a1',
    sentAt: null,
    sentTo: [],
    sendCount: 0,
    signedSnapshot: JSON.parse(JSON.stringify(snapshot())),
    sendAttemptNo: null,
    sendAttempt: null,
    fundingAttestationKey: null,
    supersededAt: null,
    supersededById: null,
    supersededReason: null,
    supersededByPacketId: null,
    supersedesPacketId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const ENV_KEYS = ['BILLING_PROVIDER_LEGAL_NAME', 'BILLING_PROVIDER_ADDRESS', 'BILLING_PACKET_PROVIDER_ORG_ID'] as const;
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('signed snapshot', () => {
  it('renders only from the snapshot: later member, program, provider or logo changes do not reach the PDF inputs', async () => {
    const signedProvider = getTrainingProviderIdentity();
    const signed = row();
    process.env.BILLING_PROVIDER_LEGAL_NAME = 'Renamed Provider';
    process.env.BILLING_PROVIDER_ADDRESS = '1 Moved St | Elsewhere, TX 00000';
    let liveLogoCalls = 0;
    const input = await packetToDocumentInput(signed, { fullName: 'Renamed Member', email: 'new@example.test' }, async () => {
      liveLogoCalls++;
      return new Uint8Array([1, 2, 3]);
    });
    assert.equal(liveLogoCalls, 0);
    assert.equal(input.provider.legalName, signedProvider.legalName);
    assert.deepEqual(input.provider.addressLines, signedProvider.addressLines);
    assert.deepEqual(input.member, { fullName: 'Name At Signing', email: 'signed@example.test' });
    assert.equal(input.programTitle, 'Title At Signing');
    assert.deepEqual(input.logoPng, LOGO);
    assert.deepEqual(input.j6Facts, ['Billed to: Test Board', 'Total due: $1,300.00']);
    assert.equal(input.coverLetterBody, 'Narrative at signing.');
  });

  it('renders byte-identical PDFs for the same packet (stable email payloads)', async () => {
    const input = await packetToDocumentInput(row(), { fullName: 'x', email: 'x@example.test' });
    const [a, b] = [await renderJ5InvoicePdf(input), await renderJ5InvoicePdf(input)];
    assert.deepEqual(Buffer.from(a), Buffer.from(b));
    const [c, d] = [await renderJ6CoverLetterPdf(input), await renderJ6CoverLetterPdf(input)];
    assert.deepEqual(Buffer.from(c), Buffer.from(d));
  });

  it('LEGACY: a null snapshot falls back to live values', async () => {
    process.env.BILLING_PROVIDER_LEGAL_NAME = 'Live Provider';
    const input = await packetToDocumentInput(row({ signedSnapshot: null }), { fullName: 'Live Member', email: 'l@example.test' }, async () => null);
    assert.equal(input.provider.legalName, 'Live Provider');
    assert.equal(input.member.fullName, 'Live Member');
    assert.equal(input.counselorAssigned, undefined);
    assert.ok(input.j6Facts.some((l) => l.startsWith('Total due')));
  });

  it('a malformed non-null snapshot throws without reading any live value', async () => {
    let liveLogoCalls = 0;
    const bad = [
      { version: 1, provider: {}, member: {} },
      'garbage',
      { ...snapshot(), member: { fullName: 'x' } },
      { ...snapshot(), fundingAttestation: { ...snapshot().fundingAttestation, reviewed: false } },
      { ...snapshot(), logo: { pngBase64: Buffer.from(LOGO).toString('base64'), sha256: 'f'.repeat(64) } },
    ];
    for (const signedSnapshot of bad) {
      await assert.rejects(
        packetToDocumentInput(row({ signedSnapshot: JSON.parse(JSON.stringify(signedSnapshot)) }), { fullName: 'Live', email: 'l@example.test' }, async () => {
          liveLogoCalls++;
          return null;
        }),
        SignedSnapshotCorruptError,
      );
    }
    assert.equal(liveLogoCalls, 0);
    assert.throws(() => parseSignedSnapshot({ version: 2 }), SignedSnapshotCorruptError);
    assert.equal(parseSignedSnapshot(null), null);
  });

  it('bounds the frozen logo', () => {
    assert.equal(freezeLogo(new Uint8Array(MAX_SNAPSHOT_LOGO_BYTES + 1)), null);
    assert.equal(freezeLogo(null), null);
    assert.match(freezeLogo(LOGO)?.sha256 ?? '', /^[0-9a-f]{64}$/);
  });
});

describe('J6 cc line', () => {
  it('names the counselor only when one was assigned at signing', async () => {
    const counselor = { userId: 'c1', fullName: 'Test Counselor', email: 'c@example.test' };
    const without = await packetToDocumentInput(row(), { fullName: 'x', email: 'x@example.test' });
    const withC = await packetToDocumentInput(row({ signedSnapshot: JSON.parse(JSON.stringify(snapshot({ counselor }))) }), { fullName: 'x', email: 'x@example.test' });
    assert.equal(j6EnclosureLines(without)[1], 'cc: Name At Signing (participant)');
    assert.equal(j6EnclosureLines(withC)[1], 'cc: Name At Signing (participant); assigned career counselor');
  });
});

describe('billing provider org', () => {
  it('defaults to DEFAULT_ORG_ID, accepts a valid override, fails closed on an invalid one, refuses other orgs', () => {
    assert.equal(getBillingProviderOrgId(), DEFAULT_ORG_ID);
    assert.deepEqual(checkBillingProviderOrg(DEFAULT_ORG_ID, DEFAULT_ORG_ID), { ok: true });
    const other = 'aaaaaaaa-0000-4000-8000-000000000009';
    assert.equal(checkBillingProviderOrg(DEFAULT_ORG_ID, other).ok, false);
    assert.equal(checkBillingProviderOrg(null).ok, false);
    assert.equal(checkBillingProviderOrg().ok, false);

    process.env.BILLING_PACKET_PROVIDER_ORG_ID = other;
    assert.deepEqual(checkBillingProviderOrg(other), { ok: true });
    assert.equal(checkBillingProviderOrg(DEFAULT_ORG_ID).ok, false);

    process.env.BILLING_PACKET_PROVIDER_ORG_ID = 'not-a-uuid';
    const originalError = console.error;
    console.error = () => {};
    try {
      const res = checkBillingProviderOrg(DEFAULT_ORG_ID);
      assert.equal(res.ok, false);
      assert.equal(res.ok === false && res.status, 503);
    } finally {
      console.error = originalError;
    }
  });
});
