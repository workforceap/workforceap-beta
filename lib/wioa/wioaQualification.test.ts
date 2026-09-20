import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { computeWioaSignal, formatWioaReasons, parseWioaAnswers, parseWioaQualificationSnapshot, type WioaBarrier, type WioaQualificationAnswers, type WioaQualificationSnapshot } from './wioaQualification';

const base = {
  countyOrZip: '78701',
  primaryBarrier: 'none' as const,
  dislocatedWorker: false,
  lowIncomeSelfReport: false,
  trainingInterest: true,
  completedIntakeSelfReport: false,
};

{
  const a = parseWioaAnswers({
    ...base,
    ageBracket: '25_54',
  });
  assert.equal(a?.ageBracket, '25_54');
}

assert.equal(parseWioaAnswers({ ...base, ageBracket: 'x' }), null);

const validSnapshot = {
  answers: {
    ...base,
    ageBracket: '25_54' as const,
    countyOrZip: ' 78701 ',
  },
  signal: 'possible' as const,
  reasons: ['Training interest may fit common WIOA pathways.'],
  submittedAt: '2026-05-30T00:00:00Z',
  version: 1 as const,
};

{
  const snapshot = parseWioaQualificationSnapshot(validSnapshot);
  assert.equal(snapshot?.signal, 'possible');
  assert.equal(snapshot?.answers.countyOrZip, '78701');
}

assert.equal(parseWioaQualificationSnapshot({ ...validSnapshot, signal: 'bad' }), null);
assert.equal(parseWioaQualificationSnapshot({ ...validSnapshot, reasons: 'bad' }), null);
assert.equal(
  parseWioaQualificationSnapshot({
    ...validSnapshot,
    answers: { ...validSnapshot.answers, ageBracket: 'x' },
  }),
  null
);

{
  const { signal } = computeWioaSignal({
    ...base,
    ageBracket: '25_54',
    lowIncomeSelfReport: true,
    dislocatedWorker: true,
    trainingInterest: true,
  });
  assert.equal(signal, 'likely');
}

{
  const { signal } = computeWioaSignal({
    ...base,
    ageBracket: 'under18',
    trainingInterest: false,
  });
  assert.equal(signal, 'unclear');
}

console.log('wioaQualification tests passed');

// 9/2/26: TANF / WIC / SNAP question is optional for old snapshots and counts as a low-income qualifier.
{
  const legacy = parseWioaAnswers({ ...base, ageBracket: '25_54' });
  assert.equal(legacy?.publicAssistanceSelfReport, null);
  const answered = parseWioaAnswers({ ...base, ageBracket: '25_54', publicAssistanceSelfReport: true });
  assert.equal(answered?.publicAssistanceSelfReport, true);
  const junk = parseWioaAnswers({ ...base, ageBracket: '25_54', publicAssistanceSelfReport: 'yes' });
  assert.equal(junk?.publicAssistanceSelfReport, null);
}

{
  const { signal, reasons } = computeWioaSignal({
    ...base,
    ageBracket: '25_54',
    primaryBarrier: 'transportation',
    publicAssistanceSelfReport: true,
  });
  assert.equal(signal, 'likely');
  assert.ok(reasons.some((r) => r.code === 'public_assistance'));
}

{
  const { signal, reasons } = computeWioaSignal({
    ...base,
    ageBracket: '25_54',
    publicAssistanceSelfReport: false,
  });
  assert.equal(signal, 'possible');
  assert.ok(!reasons.some((r) => r.code === 'public_assistance'));
}

test('WAP-53 follow-ups parse after a Yes, are dropped after a No, and legacy snapshots round-trip unchanged', () => {
  const withDetail = parseWioaAnswers({ ...base, ageBracket: '25_54', publicAssistanceSelfReport: true, publicAssistancePrograms: ['snap', 'bogus', 'snap'], publicAssistanceHelpRequested: true });
  assert.deepEqual(withDetail?.publicAssistancePrograms, ['snap']);
  assert.equal(withDetail?.publicAssistanceHelpRequested, true);
  const afterNo = parseWioaAnswers({ ...base, ageBracket: '25_54', publicAssistanceSelfReport: false, publicAssistancePrograms: ['snap'], publicAssistanceHelpRequested: true });
  assert.equal('publicAssistancePrograms' in (afterNo ?? {}), false);
  assert.equal('publicAssistanceHelpRequested' in (afterNo ?? {}), false);
  const legacy = parseWioaAnswers({ ...base, ageBracket: '25_54', publicAssistanceSelfReport: true });
  assert.deepEqual(legacy, { ...base, ageBracket: '25_54', publicAssistanceSelfReport: true });
});

test('WIC alone is not treated as a definitive low-income indicator (WAP-53 acceptance 6)', () => {
  const wicOnly = computeWioaSignal({ ...base, ageBracket: '25_54', primaryBarrier: 'transportation', publicAssistanceSelfReport: true, publicAssistancePrograms: ['wic'] });
  assert.equal(wicOnly.signal, 'possible');
  assert.ok(wicOnly.reasons.some((r) => r.code === 'wic_only_review'));
  assert.ok(!wicOnly.reasons.some((r) => r.code === 'public_assistance'));
  const wicAndSnap = computeWioaSignal({ ...base, ageBracket: '25_54', primaryBarrier: 'transportation', publicAssistanceSelfReport: true, publicAssistancePrograms: ['wic', 'snap'] });
  assert.equal(wicAndSnap.signal, 'likely');
  assert.ok(wicAndSnap.reasons.some((r) => r.code === 'public_assistance'));
  // A Yes with no detail (pre-WAP-53 snapshot) keeps the historical policy.
  const noDetail = computeWioaSignal({ ...base, ageBracket: '25_54', primaryBarrier: 'transportation', publicAssistanceSelfReport: true });
  assert.equal(noDetail.signal, 'likely');
  // Help requested never changes the signal: it is a staff action, not evidence.
  const help = computeWioaSignal({ ...base, ageBracket: '25_54', primaryBarrier: 'transportation', publicAssistanceSelfReport: true, publicAssistancePrograms: ['wic'], publicAssistanceHelpRequested: true });
  assert.equal(help.signal, wicOnly.signal);
  const snapshot: WioaQualificationSnapshot = { version: 2, submittedAt: validSnapshot.submittedAt, answers: { ...base, ageBracket: '25_54', publicAssistanceSelfReport: true, publicAssistancePrograms: ['wic'] }, ...wicOnly };
  assert.deepEqual(parseWioaQualificationSnapshot(snapshot), snapshot);
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
    const t = createTranslator({ locale, messages, namespace: 'wioa', onError: (error) => { throw error; } });
    assert.equal(formatWioaReasons({ ...snapshot, reasons: [{ code: 'wic_only_review' }] }, t)[0], messages.wioa.reasons.wic_only_review);
  }
});

test('all 1,536 policy combinations preserve the version-1 signals and English explanations', () => {
  // Frozen from 79ff683's implementation before the localization change.
  // Includes all age/barrier/benefit/boolean branches, including WIC/TANF/SNAP policy.
  const cases = [];
  for (const ageBracket of ['under18', '18_24', '25_54', '55_plus'] as const) {
    for (const primaryBarrier of ['none', 'basic_skills', 'english_language', 'criminal_record', 'transportation', 'childcare', 'housing', 'other'] as WioaBarrier[]) {
      for (const publicAssistanceSelfReport of [null, false, true]) {
        for (let bits = 0; bits < 16; bits++) {
          const answers: WioaQualificationAnswers = {
            ageBracket, countyOrZip: '78701', primaryBarrier, publicAssistanceSelfReport,
            dislocatedWorker: !!(bits & 1), lowIncomeSelfReport: !!(bits & 2),
            trainingInterest: !!(bits & 4), completedIntakeSelfReport: !!(bits & 8),
          };
          const result = computeWioaSignal(answers);
          const snapshot: WioaQualificationSnapshot = { version: 2, submittedAt: validSnapshot.submittedAt, answers, ...result };
          const parsed = parseWioaQualificationSnapshot(snapshot);
          assert.deepEqual(parsed, snapshot);
          const reasons = formatWioaReasons(snapshot);
          cases.push({ answers, signal: result.signal, reasons });
          // Historical explanations are recognized without mutating stored history.
          const legacy: WioaQualificationSnapshot = { ...snapshot, version: 1, reasons };
          assert.deepEqual(formatWioaReasons(legacy), reasons);
        }
      }
    }
  }
  assert.equal(cases.length, 1536);
  assert.equal(createHash('sha256').update(JSON.stringify(cases)).digest('hex'), '32a5a77c3ac8ff45804a4b74ec5d4e0c8d1f3b2e93267329edb54331881fe3aa');
});

test('new reason parameters validate while old unknown text is preserved and labeled', () => {
  for (const reasons of [[{ code: 'invented' }], [{ code: 'barrier', params: { barrier: 'invented' } }], [{ code: 'barrier' }], ['legacy prose']]) {
    assert.equal(parseWioaQualificationSnapshot({ ...validSnapshot, version: 2, reasons }), null);
  }
  const legacy = parseWioaQualificationSnapshot(validSnapshot)!;
  assert.deepEqual(legacy.reasons, validSnapshot.reasons);
  assert.deepEqual(formatWioaReasons(legacy), ['Saved explanation (original language): Training interest may fit common WIOA pathways.']);
  assert.deepEqual(formatWioaReasons({ ...validSnapshot, reasons: [] }), ['No explanation was saved with this assessment.']);
});

test('all reason branches and barrier parameters translate in all supported languages', () => {
  const answers: WioaQualificationAnswers = { ...validSnapshot.answers, ageBracket: 'under18', primaryBarrier: 'transportation', dislocatedWorker: true, lowIncomeSelfReport: true, trainingInterest: true, completedIntakeSelfReport: true, publicAssistanceSelfReport: true };
  const snapshot: WioaQualificationSnapshot = { version: 2, submittedAt: validSnapshot.submittedAt, answers, ...computeWioaSignal(answers) };
  assert.deepEqual(snapshot.reasons.map((reason) => reason.code), ['public_assistance', 'low_income', 'dislocated_worker', 'barrier', 'training_interest', 'intake_complete', 'youth_review']);
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
    const t = createTranslator({ locale, messages, namespace: 'wioa', onError: (error) => { throw error; } });
    const formatted = formatWioaReasons(snapshot, t);
    assert.equal(formatted.length, 7);
    assert.ok(formatted[3].includes(messages.wioa.barriers.transportation));
    assert.equal(formatWioaReasons({ ...snapshot, version: 1, reasons: formatWioaReasons(snapshot) }, t).join('\n'), formatted.join('\n'));
    assert.equal(formatWioaReasons(validSnapshot, t)[0], t('reasons.legacy', { text: validSnapshot.reasons[0] }));
    assert.equal(formatWioaReasons({ ...snapshot, reasons: [{ code: 'staff_review' }] }, t)[0], messages.wioa.reasons.staff_review);
    assert.equal(formatWioaReasons({ ...validSnapshot, reasons: [] }, t)[0], messages.wioa.reasons.unavailable);
    for (const barrier of ['basic_skills', 'english_language', 'criminal_record', 'transportation', 'childcare', 'housing', 'other'] as WioaBarrier[]) {
      const text = formatWioaReasons({ ...snapshot, reasons: [{ code: 'barrier', params: { barrier } }] }, t)[0];
      assert.ok(text.includes(messages.wioa.barriers[barrier]));
    }
  }
});
