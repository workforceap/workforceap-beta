import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateAmount,
  attestationFingerprint,
  buildJ6Facts,
  defaultCoverLetterNarrative,
  formatLongDateOfInstant,
  formatMoney,
  fundingReviewWarnings,
  isoDateInPortalTz,
  isoDatePlusDays,
  narrativeFactHints,
  narrativeMoneyViolations,
  totalContactHours,
  type ReviewedValues,
} from './packetText';
import { buildDefaultLineItems, resolveProgramPricing } from './packetDefaults';
import { createPacketSchema, normalizeFundingReference, parseLineItems, sumLineItems, type PacketLineItem } from './packetSchema';
import { formatPacketNumber } from './packetNumber';

// Synthetic test data only; no real ITA, contract or approval.
describe('allocateAmount', () => {
  it('splits by weight in whole cents and always sums back to the total', () => {
    const shares = allocateAmount(7500, [10, 10, 10, 10, 10, 10]);
    assert.deepEqual(shares, [1250, 1250, 1250, 1250, 1250, 1250]);
    const uneven = allocateAmount(1000, [1, 1, 1]);
    assert.equal(uneven.reduce((a, b) => a + b, 0), 1000);
    assert.deepEqual(uneven, [333.33, 333.33, 333.34]);
  });

  it('shares equally when no row has hours, and returns [] for no rows', () => {
    assert.deepEqual(allocateAmount(300, [0, 0, 0]), [100, 100, 100]);
    assert.deepEqual(allocateAmount(300, []), []);
  });
});

describe('buildDefaultLineItems + pricing', () => {
  it('prefers the organization catalog, then the syllabus, then the price-list default', () => {
    const fromCatalog = resolveProgramPricing({ slug: 'anything' }, { cost: 4200, certCost: 300, bookCost: 0, miscCost: 50 });
    assert.equal(fromCatalog.source, 'organization_catalog');
    assert.equal(fromCatalog.tuition, 4200);
    const fromSyllabus = resolveProgramPricing({ slug: 'it-support-professional-certificate-ibm' }, null);
    assert.equal(fromSyllabus.source, 'syllabus');
    const fallback = resolveProgramPricing({ slug: 'no-such-program' }, null);
    assert.equal(fallback.source, 'price_list_default');
    assert.equal(fallback.tuition, 7500, 'kept only as the price-list maximum reference');
  });

  it('catalog pricing: one row per class plus fee rows, and the rows sum to tuition + fees', () => {
    const pricing = resolveProgramPricing({ slug: 'x' }, { cost: 5000, certCost: 400, bookCost: 100, miscCost: 0 });
    const rows = buildDefaultLineItems({
      programTitle: 'Test Program',
      pricing,
      courses: [
        { name: 'Intro', estimatedHours: 20 },
        { name: 'Advanced', estimatedHours: 30 },
      ],
    });
    assert.deepEqual(rows.map((r) => r.description), ['Intro', 'Advanced', 'Certification exam voucher(s)', 'Books and course materials']);
    assert.deepEqual(rows.map((r) => r.amount), [2000, 3000, 400, 100]);
    assert.equal(sumLineItems(rows as PacketLineItem[]), 5500);
  });

  it('syllabus pricing is unchanged: the syllabus tuition is spread across the classes', () => {
    const pricing = resolveProgramPricing({ slug: 'it-support-professional-certificate-ibm' }, null);
    const rows = buildDefaultLineItems({ programTitle: 'T', pricing, courses: [{ name: 'A', estimatedHours: 1 }, { name: 'B', estimatedHours: 1 }] });
    assert.deepEqual(rows.map((r) => r.amount), [pricing.tuition / 2, pricing.tuition / 2]);
  });

  it('no catalog or syllabus price: tuition rows are empty, never the $7,500 ceiling', () => {
    const pricing = resolveProgramPricing({ slug: 'no-such-program' }, null);
    const classes = buildDefaultLineItems({ programTitle: 'Custom', pricing, courses: [{ name: 'A', estimatedHours: 10 }, { name: 'B', estimatedHours: 20 }] });
    assert.deepEqual(classes.map((r) => r.amount), [null, null]);
    assert.deepEqual(classes.map((r) => r.hours), [10, 20]);
    const single = buildDefaultLineItems({ programTitle: 'Custom', pricing, courses: [] });
    assert.equal(single.length, 1);
    assert.equal(single[0].amount, null);
  });
});

describe('J6 facts block and narrative', () => {
  const rows: PacketLineItem[] = [
    { description: 'Intro', hours: 10, amount: 1000 },
    { description: 'Advanced', hours: 20, amount: 2000 },
    { description: 'Exam voucher', hours: null, amount: 300 },
  ];
  const factsFor = (lineItems: PacketLineItem[]) =>
    buildJ6Facts({
      invoiceDate: '2026-09-25',
      dueDate: '2026-10-25',
      billToName: 'Test Board',
      referenceNumber: 'REF-1',
      lineItems,
      funding: { fundingType: 'wioa_ita', approvedAmount: 3300, reference: 'TEST-ITA-1' },
    });

  it('states every row with its own amount, the totals, bill-to, reference, funding and dates', () => {
    assert.deepEqual(factsFor(rows), [
      'Invoice date: September 25, 2026; due: October 25, 2026',
      'Billed to: Test Board',
      'Board / ITA / voucher reference: REF-1',
      'Funding (staff-recorded): WIOA ITA, reference TEST-ITA-1, approved amount $3,300.00',
      '1. Intro (10 contact hours): $1,000.00',
      '2. Advanced (20 contact hours): $2,000.00',
      '3. Exam voucher: $300.00',
      'Total contact hours: 30',
      'Total due: $3,300.00',
    ]);
  });

  it('always follows the rows after an edit', () => {
    const edited = [{ ...rows[0], amount: 1250 }, rows[1]];
    const facts = factsFor(edited);
    assert.ok(facts.includes('1. Intro (10 contact hours): $1,250.00'));
    assert.ok(facts.includes('Total due: $3,250.00'));
    assert.ok(!facts.some((l) => l.includes('Exam voucher')));
  });

  it('the default narrative states no facts and passes the money block', () => {
    const narrative = defaultCoverLetterNarrative('Test Provider');
    assert.doesNotMatch(narrative, /\$\d|contact hours|enrolled/);
    assert.deepEqual(narrativeMoneyViolations(narrative), []);
    assert.deepEqual(narrativeFactHints(narrative), []);
    assert.equal(narrativeFactHints('It runs 10 contact hours.').length, 1);
  });

  it('hard-blocks money in the narrative; other wording (e.g. a payer name) is left to the signer review', () => {
    for (const text of ['Intro costs $2,000.', 'The total is 7500.', 'amount of 1300.00', '7,500 for tuition', 'The fee is 300']) {
      assert.ok(narrativeMoneyViolations(text).length > 0, text);
    }
    for (const text of ['This invoice is billed to Another Workforce Board.', 'Please see Form J5 invoice enclosed.', 'Suite 200, Austin TX 78660']) {
      assert.deepEqual(narrativeMoneyViolations(text), [], text);
    }
  });
});

describe('funding review warnings', () => {
  it('warns (never blocks) for a WIOA ITA above the Capital Area standard, not for a separate contract', () => {
    assert.equal(fundingReviewWarnings({ fundingType: 'wioa_ita', total: 7500 }).length, 0);
    const [warning] = fundingReviewWarnings({ fundingType: 'wioa_ita', total: 8000 });
    assert.match(warning, /Capital Area Board's standard ITA amount/);
    assert.match(warning, /unverified/);
    assert.equal(fundingReviewWarnings({ fundingType: 'separate_contract', total: 9000 }).length, 0);
  });
});

describe('attestation fingerprint', () => {
  const base: ReviewedValues = {
    programSlug: 'p',
    invoiceDate: '2026-09-25',
    dueDate: null,
    billToName: 'Board',
    referenceNumber: '',
    lineItems: [{ description: 'Intro', hours: 10, amount: 1000 }],
    fundingBasis: 'wioa_ita',
    approvedAmount: 1000,
    fundingReference: 'TEST-ITA-1',
    exceptionNote: '',
    narrative: 'Narrative.',
  };
  it('changes when a reviewed value changes', () => {
    const fp = attestationFingerprint(base);
    assert.match(fp, /^[0-9a-f]{16}$/);
    assert.equal(attestationFingerprint({ ...base }), fp);
    assert.notEqual(attestationFingerprint({ ...base, lineItems: [{ description: 'Intro', hours: 10, amount: 1001 }] }), fp);
    assert.notEqual(attestationFingerprint({ ...base, approvedAmount: 2000 }), fp);
    assert.notEqual(attestationFingerprint({ ...base, fundingBasis: 'separate_contract' }), fp);
    assert.notEqual(attestationFingerprint({ ...base, fundingReference: 'TEST-ITA-2' }), fp);
    assert.notEqual(attestationFingerprint({ ...base, narrative: 'Edited narrative.' }), fp);
  });
});

describe('schema + helpers', () => {
  const attestation = { fundingBasis: 'separate_contract', approvedAmount: 100, reference: 'TEST-CONTRACT-1', reviewed: true, tuitionMatches: true };
  const base = {
    programSlug: 'it-support-professional-certificate-ibm',
    invoiceDate: '2026-09-04',
    billToName: 'Board',
    lineItems: [{ description: 'Intro', hours: 10, amount: 100 }],
    coverLetterBody: 'A perfectly adequate cover letter body for testing.',
    signerName: 'Michael A. Brown',
    signerTitle: 'Executive Director',
    signatureTyped: true,
    fundingAttestation: attestation,
    j6FactsReviewed: true,
    reviewedFingerprint: '0123456789abcdef',
  };

  it('requires a signature (drawn or typed) and rejects negative or missing amounts', () => {
    assert.equal(createPacketSchema.safeParse(base).success, true);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureTyped: false }).success, false);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureTyped: false, signatureImage: 'data:image/png;base64,iVBORw0KGgo=' }).success, true);
    assert.equal(createPacketSchema.safeParse({ ...base, lineItems: [{ description: 'x', amount: -1 }] }).success, false);
    const empty = createPacketSchema.safeParse({ ...base, lineItems: [{ description: 'x', hours: 1, amount: null }] });
    assert.equal(empty.success, false);
    assert.match(empty.error?.errors[0]?.message ?? '', /Enter an amount for every row/);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureImage: 'data:image/jpeg;base64,AAAA' }).success, false);
  });

  it('requires an explicit staff attestation with a known basis, a reference and a positive amount; nothing defaults', () => {
    const { fundingAttestation: _omit, ...missing } = base;
    const res = createPacketSchema.safeParse(missing);
    assert.equal(res.success, false);
    assert.match(res.error?.errors[0]?.message ?? '', /funding basis, approved amount and reference/);
    for (const bad of [
      { ...attestation, reviewed: false },
      { ...attestation, reviewed: undefined },
      { ...attestation, tuitionMatches: false },
      { ...attestation, fundingBasis: undefined },
      { ...attestation, fundingBasis: 'other' },
      { ...attestation, approvedAmount: 0 },
      { ...attestation, approvedAmount: -5 },
      { ...attestation, reference: '' },
      { ...attestation, reference: '   ab  ' },
    ]) {
      assert.equal(createPacketSchema.safeParse({ ...base, fundingAttestation: bad }).success, false, JSON.stringify(bad));
    }
    assert.equal(createPacketSchema.safeParse({ ...base, j6FactsReviewed: false }).success, false);
    assert.equal(createPacketSchema.safeParse({ ...base, reviewedFingerprint: undefined }).success, false);
  });

  it('parses stored JSON rows defensively', () => {
    assert.deepEqual(parseLineItems([{ description: 'A', hours: 5, amount: 10 }, { nope: true }, null, { description: 'B', amount: 'x' }]), [
      { description: 'A', hours: 5, amount: 10 },
      { description: 'B', hours: null, amount: 0 },
    ]);
    assert.deepEqual(parseLineItems('garbage'), []);
  });

  it('canonicalizes funding references: case and punctuation variants collide', () => {
    for (const ref of ['ITA-123', 'ita 123', 'ITA_123.', ' i.t.a-1 2 3 ']) assert.equal(normalizeFundingReference(ref), 'ITA123', ref);
    assert.notEqual(normalizeFundingReference('ITA-124'), 'ITA123');
  });

  it('defaults form dates to the Central-time business day', () => {
    // 23:30 CDT on Sept 25 is 04:30 UTC on Sept 26.
    const lateEvening = new Date('2026-09-26T04:30:00Z');
    assert.equal(isoDateInPortalTz(0, lateEvening), '2026-09-25');
    assert.equal(isoDateInPortalTz(30, lateEvening), '2026-10-25');
    assert.equal(isoDatePlusDays(0, lateEvening), '2026-09-26', 'the UTC helper is why the default was wrong');
  });

  it('formats money, dates and invoice numbers', () => {
    assert.equal(formatMoney(1234.5), '$1,234.50');
    assert.equal(formatPacketNumber('WAP', 2026, 7), 'WAP-2026-0007');
    assert.equal(isoDatePlusDays(30, new Date('2026-09-04T12:00:00Z')), '2026-10-04');
    assert.equal(totalContactHours([{ description: 'a', hours: 2, amount: 0 }, { description: 'b', hours: null, amount: 0 }]), 2);
    // Instants (signed/emailed) use Central time: 8:30 pm CDT stays on the 25th.
    assert.equal(formatLongDateOfInstant(new Date('2026-09-26T01:30:00Z')), 'September 25, 2026');
    assert.equal(formatLongDateOfInstant('2026-09-26T06:00:00.000Z'), 'September 26, 2026');
  });
});
