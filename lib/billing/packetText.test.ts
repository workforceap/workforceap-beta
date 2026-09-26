import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { allocateAmount, defaultCoverLetterBody, formatLongDateOfInstant, formatMoney, isoDatePlusDays, totalContactHours } from './packetText';
import { buildDefaultLineItems, resolveProgramPricing } from './packetDefaults';
import { createPacketSchema, parseLineItems, sumLineItems } from './packetSchema';
import { formatPacketNumber } from './packetNumber';

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
    const fromSyllabus = resolveProgramPricing({ slug: 'google-it-support' }, null);
    assert.ok(['syllabus', 'price_list_default'].includes(fromSyllabus.source));
    assert.equal(resolveProgramPricing({ slug: 'no-such-program' }, null).tuition, 7500);
  });

  it('makes one row per class plus fee rows, and the rows sum to tuition + fees', () => {
    const pricing = resolveProgramPricing({ slug: 'x' }, { cost: 5000, certCost: 400, bookCost: 100, miscCost: 0 });
    const rows = buildDefaultLineItems({
      programTitle: 'Test Program',
      pricing,
      courses: [
        { name: 'Intro', estimatedHours: 20 },
        { name: 'Advanced', estimatedHours: 30 },
      ],
    });
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => r.description), ['Intro', 'Advanced', 'Certification exam voucher(s)', 'Books and course materials']);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.amount), [2000, 3000]);
    assert.equal(sumLineItems(rows), 5500);
    assert.equal(totalContactHours(rows), 50);
  });

  it('falls back to a single tuition row when the program has no classes on file', () => {
    const rows = buildDefaultLineItems({ programTitle: 'Custom', pricing: resolveProgramPricing({ slug: 'x' }, null), courses: [] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 7500);
    assert.equal(rows[0].hours, null);
  });
});

describe('defaultCoverLetterBody', () => {
  it('names the student, program, classes, total and bill-to', () => {
    const body = defaultCoverLetterBody({
      memberName: 'Tarrance Hopkins',
      programTitle: 'IT Support',
      billToName: 'Workforce Solutions Capital Area',
      providerName: 'Workforce Advancement Project',
      referenceNumber: 'ITA-1',
      lineItems: [
        { description: 'Intro', hours: 10, amount: 1000 },
        { description: 'Exam voucher', hours: null, amount: 250 },
      ],
    });
    assert.match(body, /Tarrance Hopkins/);
    assert.match(body, /IT Support program under reference ITA-1/);
    assert.match(body, /- Intro \(10 contact hours\)/);
    assert.ok(!body.includes('- Exam voucher'), 'fee rows are not listed as classes');
    assert.match(body, /\$1,250\.00/);
    assert.match(body, /billed to Workforce Solutions Capital Area/);
    assert.match(body, /no cost to the participant/);
  });
});

describe('schema + helpers', () => {
  it('requires a signature (drawn or typed) and rejects negative amounts', () => {
    const base = {
      programSlug: 'google-it-support',
      invoiceDate: '2026-09-04',
      billToName: 'Board',
      lineItems: [{ description: 'Intro', hours: 10, amount: 100 }],
      coverLetterBody: 'A perfectly adequate cover letter body for testing.',
      signerName: 'Michael A. Brown',
      signerTitle: 'Executive Director',
      // Synthetic funding approval for the schema test.
      fundingApproval: { fundingType: 'wioa_ita', approvedAmount: 100, basis: 'TEST-ITA-1', reviewed: true },
    };
    assert.equal(createPacketSchema.safeParse(base).success, false);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureTyped: true }).success, true);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureImage: 'data:image/png;base64,iVBORw0KGgo=' }).success, true);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureTyped: true, lineItems: [{ description: 'x', amount: -1 }] }).success, false);
    assert.equal(createPacketSchema.safeParse({ ...base, signatureTyped: true, signatureImage: 'data:image/jpeg;base64,AAAA' }).success, false);
  });

  it('requires a reviewed approved amount and funding basis, never a default', () => {
    const base = {
      programSlug: 'google-it-support',
      invoiceDate: '2026-09-04',
      billToName: 'Board',
      lineItems: [{ description: 'Intro', hours: 10, amount: 100 }],
      coverLetterBody: 'A perfectly adequate cover letter body for testing.',
      signerName: 'Michael A. Brown',
      signerTitle: 'Executive Director',
      signatureTyped: true,
    };
    const funding = { fundingType: 'separate_contract', approvedAmount: 100, basis: 'TEST-CONTRACT-1', reviewed: true };
    assert.equal(createPacketSchema.safeParse({ ...base, fundingApproval: funding }).success, true);
    const missing = createPacketSchema.safeParse(base);
    assert.equal(missing.success, false);
    assert.match(missing.error?.errors[0]?.message ?? '', /approved amount and funding basis/);
    for (const bad of [
      { ...funding, reviewed: false },
      { ...funding, fundingType: undefined },
      { ...funding, fundingType: 'other' },
      { ...funding, approvedAmount: 0 },
      { ...funding, basis: '' },
    ]) {
      assert.equal(createPacketSchema.safeParse({ ...base, fundingApproval: bad }).success, false, JSON.stringify(bad));
    }
  });

  it('parses stored JSON rows defensively', () => {
    assert.deepEqual(parseLineItems([{ description: 'A', hours: 5, amount: 10 }, { nope: true }, null, { description: 'B', amount: 'x' }]), [
      { description: 'A', hours: 5, amount: 10 },
      { description: 'B', hours: null, amount: 0 },
    ]);
    assert.deepEqual(parseLineItems('garbage'), []);
  });

  it('formats money, dates and invoice numbers', () => {
    assert.equal(formatMoney(1234.5), '$1,234.50');
    assert.equal(formatPacketNumber('WAP', 2026, 7), 'WAP-2026-0007');
    assert.equal(isoDatePlusDays(30, new Date('2026-09-04T12:00:00Z')), '2026-10-04');
    // Instants (signed/emailed) use Central time: 8:30 pm CDT stays on the 25th.
    assert.equal(formatLongDateOfInstant(new Date('2026-09-26T01:30:00Z')), 'September 25, 2026');
    assert.equal(formatLongDateOfInstant('2026-09-26T06:00:00.000Z'), 'September 26, 2026');
  });
});
