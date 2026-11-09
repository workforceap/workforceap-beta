import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonical, digest, localEvidenceDate, periodDates, summarize, validateEvidence, type Evidence } from './evidence';
const date = '2026-11-09';
const evidence = (over: Partial<Evidence> = {}): Evidence => ({ sourceKey: 'dated-admin-total', date, kind: 'verified-duration', minutes: 240, reference: 'synthetic-register-1', verifiedBy: 'synthetic-admin', reason: 'Synthetic reviewed daily total', ...over });

test('unknown telemetry remains unknown, never absence or zero', () => {
  assert.deepEqual(summarize([date], []), [{ date, actualMinutes: null, estimatedMinutes: null, codes: [], evidenceKeys: [] }]);
});
test('estimated hours cannot become actual attendance or P', () => {
  const day = summarize([date], [evidence({ kind: 'estimated', minutes: 900, verifiedBy: null })])[0];
  assert.equal(day.actualMinutes, null); assert.equal(day.estimatedMinutes, 900); assert.deepEqual(day.codes, []);
});
test('P requires at least four verified hours, max one per day including duplicates', () => {
  for (const minutes of [0, 60, 239, 240, 241, 600, 1440]) {
    const row = evidence({ minutes });
    const day = summarize([date], [row, { ...row }])[0];
    assert.equal(day.actualMinutes, minutes);
    assert.deepEqual(day.codes, minutes >= 240 ? ['P'] : []);
    assert.equal(day.evidenceKeys.length, 1);
  }
});
test('conflicting import identities and potentially overlapping daily totals fail closed', () => {
  assert.throws(() => summarize([date], [evidence(), evidence({ minutes: 241 })]), /CONFLICTING_EVIDENCE_IDENTITY/);
  assert.throws(() => summarize([date], [evidence(), evidence({ sourceKey: 'course-badge-duplicate' })]), /AMBIGUOUS_DAILY_TOTAL/);
});
test('independent W and CR do not create actual hours; A requires independent evidence', () => {
  const day = summarize([date], [evidence({ kind: 'W', minutes: undefined }), evidence({ sourceKey: 'recording', kind: 'CR', minutes: undefined })])[0];
  assert.equal(day.actualMinutes, null); assert.deepEqual(day.codes, ['W', 'CR']);
  assert.deepEqual(summarize([date], [evidence({ kind: 'A', minutes: undefined })])[0].codes, ['A']);
  assert.throws(() => summarize([date], [evidence(), evidence({ sourceKey: 'absence', kind: 'A', minutes: undefined })]), /CONFLICTING_ABSENCE/);
});
test('dated evidence requires provenance and bounded integer daily totals', () => {
  for (const minutes of [-1, 1441, Infinity, NaN, 2.5, undefined]) assert.throws(() => validateEvidence(evidence({ minutes })));
  for (const over of [{ verifiedBy: null }, { reference: '' }, { reason: '' }, { date: '2026-02-30' }, { sourceKey: '' }]) assert.throws(() => validateEvidence(evidence(over)));
  assert.throws(() => validateEvidence(evidence({ kind: 'W' })), /CODE_IS_NOT_ACTUAL_HOURS/);
});
test('weekly and monthly calendars use dates, not elapsed DST hours', () => {
  const week = periodDates('weekly', '2026-11-01', null);
  assert.equal(week.length, 7); assert.equal(week[0], '2026-10-26'); assert.equal(week[6], '2026-11-01');
  assert.equal(periodDates('monthly', '2028-02-29', null).length, 29);
  assert.equal(periodDates('monthly', '2027-02-01', null).length, 28);
  assert.throws(() => periodDates('monthly', '2027-02-29', null), /INVALID_DATE/);
});
test('academic year is twelve months anchored to explicit enrollment start month', () => {
  const leap = periodDates('yearly', '2028-02-29', 8);
  assert.equal(leap.length, 366); assert.equal(leap[0], '2027-08-01'); assert.equal(leap.at(-1), '2028-07-31');
  assert.equal(periodDates('yearly', '2026-08-01', 8)[0], '2026-08-01');
  for (const month of [null, 0, 13, 1.5]) assert.throws(() => periodDates('yearly', date, month), /ENROLLMENT_START_MONTH_REQUIRED/);
});
test('Chicago midnight and both DST transitions preserve correct evidence date', () => {
  const samples = [
    ['2026-03-08T05:59:59Z', '2026-03-07'], ['2026-03-08T06:00:00Z', '2026-03-08'],
    ['2026-03-08T07:59:59Z', '2026-03-08'], ['2026-03-08T08:00:00Z', '2026-03-08'],
    ['2026-11-01T06:30:00Z', '2026-11-01'], ['2026-11-01T07:30:00Z', '2026-11-01'],
  ];
  for (const [timestamp, expected] of samples) assert.equal(localEvidenceDate(timestamp), expected);
  assert.throws(() => localEvidenceDate('2026-11-01T01:30:00'), /TIMESTAMP_OFFSET_REQUIRED/);
});
test('frozen hash canonicalizes keys and rejects ambiguous JSON values', () => {
  assert.equal(digest({ a: 1, b: [true, null] }), digest({ b: [true, null], a: 1 }));
  assert.notEqual(digest({ a: 1 }), digest({ a: 2 }));
  for (const value of [undefined, NaN, new Date(), { a: undefined }]) assert.throws(() => canonical(value));
});

test('canonical digest rejects sparse arrays, extra keys, symbols and accessors', () => {
  const sparse = Array(1);
  const extra = Object.assign([], { extra: true });
  const symbol = { [Symbol('hidden')]: 1 };
  const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
  const getter = Object.defineProperty({}, 'getter', { get() { throw new Error('GETTER_RAN'); }, enumerable: true });
  for (const value of [sparse, extra, symbol, hidden, getter]) assert.throws(() => digest(value), /NON_CANONICAL/);
  assert.notEqual(digest([]), digest([null]));
});
test('timestamp calendar components cannot silently normalize and supported years cannot overflow', () => {
  for (const value of ['2026-02-30T12:00:00Z', '2026-11-31T12:00:00Z', '2026-11-09T24:00:00Z',
    '0000-01-01T12:00:00Z', '1900-01-01T00:00:00Z', '2101-01-01T12:00:00Z']) assert.throws(() => localEvidenceDate(value));
  for (const args of [['yearly', '1900-01-01', 8], ['yearly', '2100-11-09', 8], ['monthly', '0000-01-01', null]] as const) {
    assert.throws(() => periodDates(args[0], args[1], args[2]));
  }
  assert.equal(localEvidenceDate('2028-02-29T12:00:00Z'), '2028-02-29');
  assert.equal(periodDates('monthly', '2100-12-01', null).at(-1), '2100-12-31');
});
