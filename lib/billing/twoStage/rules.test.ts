import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_SYLLABI } from '@/shared/programSyllabi';
import { addCalendarMonthsClamped, addDays, billingToday, classEndDate, daysBetween, parseIsoDate } from './dates';
import { AI_SOFTWARE_CANONICAL_SLUG, resolveProgramTerms } from './hours';
import { assertSingleTuitionLine, buildTuitionLineItems, formatUsdCents, tuitionLineText } from './lineItem';
import { j5Recipients, j6Recipients } from './recipients';
import { TUITION_AND_FEES_CENTS, authorizedSignerLine } from './constants';
import { WAP_BILLING_LETTERHEAD } from './letterhead';

describe('class end date: start + 5 calendar months, month-end clamped', () => {
  const cases: Array<[string, string]> = [
    ['2026-09-30', '2027-02-28'], // Mike's case (160h program)
    ['2026-10-31', '2027-03-31'], // Mike's case (200h program)
    ['2026-01-31', '2026-06-30'],
    ['2026-08-31', '2027-01-31'],
    ['2026-09-29', '2027-02-28'],
    ['2027-09-30', '2028-02-29'], // leap year
    ['2027-09-29', '2028-02-29'],
    ['2028-09-30', '2029-02-28'],
    ['2026-03-15', '2026-08-15'],
    ['2026-12-01', '2027-05-01'],
  ];
  for (const [start, end] of cases) {
    it(`${start} -> ${end}`, () => assert.equal(classEndDate(start), end));
  }

  it('handles negative months and year boundaries', () => {
    assert.equal(addCalendarMonthsClamped('2027-03-31', -1), '2027-02-28');
    assert.equal(addCalendarMonthsClamped('2026-11-30', 2), '2027-01-30');
  });

  it('rejects impossible or malformed dates instead of rolling them over', () => {
    assert.equal(parseIsoDate('2027-02-29'), null);
    assert.equal(parseIsoDate('2026-13-01'), null);
    assert.equal(parseIsoDate('2026-9-1'), null);
    assert.throws(() => classEndDate('2026-02-30'));
  });

  it('adds days and counts days across month and year ends', () => {
    assert.equal(addDays('2026-12-28', 10), '2027-01-07');
    assert.equal(daysBetween('2026-09-30', '2026-10-05'), 5);
    assert.equal(daysBetween('2027-02-28', '2027-02-01'), -27);
  });

  it('decides "today" in the Texas time zone, not UTC', () => {
    // 03:30 UTC on Oct 1 is still Sep 30 in America/Chicago (CDT, UTC-5).
    assert.equal(billingToday(new Date('2026-10-01T03:30:00Z')), '2026-09-30');
    assert.equal(billingToday(new Date('2026-10-01T06:00:00Z')), '2026-10-01');
  });
});

describe('contract hours: canonical slug + approved syllabus', () => {
  it('bills the IBM AI & Software Developer program at 200 hours, canonical slug and legacy alias alike', () => {
    for (const slug of [AI_SOFTWARE_CANONICAL_SLUG, 'ai-and-software-development-professional-certificate-ibm', '  Software-Developer-Professional-Certificate-IBM ']) {
      const terms = resolveProgramTerms(slug);
      assert.ok(terms.ok, slug);
      assert.equal(terms.hours, 200);
      assert.equal(terms.canonicalSlug, AI_SOFTWARE_CANONICAL_SLUG);
      assert.equal(terms.className, 'AI and Software Developer Professional Certificate (IBM)');
    }
  });

  it('bills the AWS AI Practitioner at 160 hours although it shares the ai-software category', () => {
    for (const slug of ['ai-practitioner-professional-certificate-aws', 'ai-practitioner-professional-certificate', 'ai-professional-developer-certificate-ibm']) {
      const terms = resolveProgramTerms(slug);
      assert.ok(terms.ok, slug);
      assert.equal(terms.hours, 160, slug);
    }
  });

  it('gives exactly one 200-hour program across every approved syllabus; all others are 160', () => {
    const hours = Object.keys(PROGRAM_SYLLABI).map((slug) => {
      const terms = resolveProgramTerms(slug);
      assert.ok(terms.ok, slug);
      return [slug, terms.hours] as const;
    });
    assert.deepEqual(hours.filter(([, h]) => h === 200).map(([s]) => s), [AI_SOFTWARE_CANONICAL_SLUG]);
    assert.ok(hours.filter(([, h]) => h !== 200).every(([, h]) => h === 160));
  });

  it('fails closed for missing, unknown or unapproved programs instead of defaulting to 160', () => {
    assert.equal(resolveProgramTerms('').ok, false);
    assert.equal(resolveProgramTerms(null).ok, false);
    const unknown = resolveProgramTerms('digital-literacy-empowerment-class');
    assert.equal(unknown.ok, false);
    assert.equal(!unknown.ok && unknown.reason, 'no_approved_syllabus');
  });

  it('fails closed when a syllabus disagrees with the 160/200 contract', () => {
    const lookup = (slug: string) => ({ slug, title: 'Synthetic', totalHours: slug === AI_SOFTWARE_CANONICAL_SLUG ? 160 : 180 });
    const drifted = resolveProgramTerms('it-support-professional-certificate-ibm', lookup);
    assert.equal(!drifted.ok && drifted.reason, 'hours_outside_contract');
    const aiDrift = resolveProgramTerms(AI_SOFTWARE_CANONICAL_SLUG, lookup);
    assert.equal(!aiDrift.ok && aiDrift.reason, 'hours_outside_contract');
  });
});

describe('the single Tuition & Fees $7,500.00 line', () => {
  it('is exactly one line of 750000 cents', () => {
    const items = buildTuitionLineItems();
    assert.equal(items.length, 1);
    assert.deepEqual({ ...items[0] }, { label: 'Tuition & Fees', amountCents: 750_000 });
    assert.equal(TUITION_AND_FEES_CENTS, 750_000);
    assert.equal(tuitionLineText(), 'Tuition & Fees $7,500.00');
    assert.doesNotThrow(() => assertSingleTuitionLine(items));
  });

  it('rejects itemized, empty or re-priced line sets', () => {
    assert.throws(() => assertSingleTuitionLine([]));
    assert.throws(() => assertSingleTuitionLine([{ label: 'Tuition & Fees', amountCents: 750_000 }, { label: 'Books', amountCents: 0 }]));
    assert.throws(() => assertSingleTuitionLine([{ label: 'Tuition & Fees', amountCents: 700_000 }]));
    assert.throws(() => assertSingleTuitionLine([{ label: 'Introduction to Software Engineering', amountCents: 750_000 }]));
  });

  it('formats whole cents without locale or float drift', () => {
    assert.equal(formatUsdCents(750_000), '$7,500.00');
    assert.equal(formatUsdCents(5), '$0.05');
    assert.equal(formatUsdCents(123_456_789), '$1,234,567.89');
    assert.throws(() => formatUsdCents(7500.5));
  });
});

describe('recipient sets', () => {
  const student = { name: 'Synthetic Student', email: 'Student@Example.test' };
  const counselor = { name: 'Synthetic Counselor', email: 'counselor@example.test' };
  const finance = { name: 'Synthetic Finance', email: 'finance@example.test' };

  it('J5 goes to exactly the counselor and the student', () => {
    const r = j5Recipients({ student, counselor });
    assert.ok(r.ok);
    assert.deepEqual(r.recipients.map((x) => x.role), ['counselor', 'student']);
    assert.equal(r.recipients.length, 2);
    assert.equal(r.recipients[1].email, 'student@example.test');
  });

  it('J6 goes to exactly board finance, the counselor and the student', () => {
    const r = j6Recipients({ finance, counselor, student });
    assert.ok(r.ok);
    assert.deepEqual(r.recipients.map((x) => x.role), ['finance', 'counselor', 'student']);
    assert.equal(r.recipients.length, 3);
  });

  it('refuses missing, invalid or shared addresses', () => {
    assert.equal(j6Recipients({ finance: { name: 'F', email: '' }, counselor, student }).ok, false);
    assert.equal(j5Recipients({ student: { name: 'S', email: 'not-an-email' }, counselor }).ok, false);
    const shared = j6Recipients({ finance: { name: 'F', email: 'COUNSELOR@example.test' }, counselor, student });
    assert.equal(shared.ok, false);
    assert.match(!shared.ok ? shared.errors.join(' ') : '', /share counselor@example\.test/);
  });
});

describe('fixed letterhead and signer text', () => {
  it('uses the WAP header lines, billing phone and repo address', () => {
    assert.deepEqual([...WAP_BILLING_LETTERHEAD.headerLines], ['Workforce Advancement Project', 'Empowering People. Advancing Futures', 'www.WorkforceAP.org']);
    assert.equal(WAP_BILLING_LETTERHEAD.footer.phone, '(512) 825-2896');
    assert.notEqual(WAP_BILLING_LETTERHEAD.footer.phone, '(512) 777-1808');
    assert.deepEqual([...WAP_BILLING_LETTERHEAD.footer.addressLines], ['207 Settlers Valley Drive, Suite C', 'Pflugerville, TX 78660']);
    assert.equal(WAP_BILLING_LETTERHEAD.logoPath, 'public/images/wap_logo.png');
  });

  it('prints the signer as Michael A. Brown, PMP, ChE — Executive Director', () => {
    assert.equal(authorizedSignerLine(), 'Michael A. Brown, PMP, ChE — Executive Director');
  });
});
