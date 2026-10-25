import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTranslator } from 'next-intl';

import { getSkillMissionDefinitionsForProgram } from '@/lib/content/skillMissionCatalog';
import {
  skillMissionEmptyState as buildEmptyState,
  skillMissionHeaderSentence as buildHeaderSentence,
  type SkillMissionTranslate,
} from './skillMissionEmptyState';

/** The real `skillMissions` catalog for a locale; a missing key or a broken ICU message throws. */
function translatorFor(locale: string): SkillMissionTranslate {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
  return createTranslator({
    locale,
    messages,
    namespace: 'skillMissions',
    onError: (error) => {
      throw error;
    },
  }) as SkillMissionTranslate;
}

const t = translatorFor('en');
const skillMissionEmptyState = (args: Parameters<typeof buildEmptyState>[0]) => buildEmptyState(args, t);
const skillMissionHeaderSentence = (counts: Parameters<typeof buildHeaderSentence>[0]) => buildHeaderSentence(counts, t);

test('unenrolled members are sent to choose a program, not a training page', () => {
  const empty = skillMissionEmptyState({ programSlug: null, programTitle: null });
  assert.equal(empty.kind, 'first');
  assert.equal(empty.tone, undefined);
  assert.equal(empty.title, 'No program enrolled');
  assert.ok(empty.description.length <= 96);
  assert.doesNotMatch(empty.description, /Enroll in a training program and a skill mission unlocks/);
  assert.equal(empty.primaryAction.href, '/dashboard/program');
  assert.equal(empty.primaryAction.label, 'Choose program');
});

test('enrolled members without catalog missions keep training, not choose-a-program', () => {
  const empty = skillMissionEmptyState({
    programSlug: 'ai-professional-practitioner-certificate',
    programTitle: 'AI Professional Practitioner Certificate',
  });
  assert.equal(empty.kind, 'unavailable');
  assert.equal(empty.tone, 'info');
  assert.equal(empty.title, 'No missions for AI Professional Practitioner Certificate yet');
  assert.doesNotMatch(empty.primaryAction.label, /Choose program/i);
  assert.equal(empty.primaryAction.href, '/dashboard/program');
  assert.equal(empty.primaryAction.label, 'Continue training');
});

test('falls back to "this program" when the catalog title is missing', () => {
  const empty = skillMissionEmptyState({
    programSlug: 'unknown-program',
    programTitle: null,
  });
  assert.equal(empty.title, 'No missions for this program yet');
  assert.equal(empty.primaryAction.href, '/dashboard/program');
});

// The /dashboard/missions page resolving its program through the dashboard
// helper (not User.enrolledProgram) is exercised in tests/app/skill-missions-page.spec.tsx.

test('staff training preview program has catalog missions so superadmins are not sent to choose-a-program', () => {
  const missions = getSkillMissionDefinitionsForProgram('comptia-a-professional-certificate');
  assert.ok(missions.length > 0);
});

test('the header sentence reflects the member own counts and stays one short line', () => {
  const sentence = (passedCount: number, readyCount: number, retryCount: number, totalMissions = 8) =>
    skillMissionHeaderSentence({ totalMissions, passedCount, readyCount, retryCount });
  assert.equal(skillMissionHeaderSentence(null), 'One pass per course. Resume bullet and STAR story.');
  assert.equal(sentence(3, 2, 1), '3 of 8 missions passed. 2 ready to start.');
  assert.equal(sentence(3, 0, 1), '3 of 8 missions passed. 1 to review and retry.');
  assert.equal(sentence(0, 0, 0), '0 of 8 missions passed. The next one unlocks when you finish a course.');
  assert.equal(sentence(1, 0, 0, 1), '1 of 1 mission passed. Each pass has its resume bullet and STAR story.');
  for (const text of [sentence(3, 2, 1), sentence(0, 0, 0), sentence(8, 0, 0)]) {
    assert.ok(text.length <= 90, text);
    assert.doesNotMatch(text, /\u2014/);
  }
});

test('every locale renders every header and empty-state branch from messages, with the member counts', () => {
  const counts = [
    { totalMissions: 8, passedCount: 3, readyCount: 2, retryCount: 1 },
    { totalMissions: 8, passedCount: 3, readyCount: 0, retryCount: 1 },
    { totalMissions: 8, passedCount: 0, readyCount: 0, retryCount: 0 },
    { totalMissions: 1, passedCount: 1, readyCount: 0, retryCount: 0 },
    { totalMissions: 4, passedCount: 4, readyCount: 0, retryCount: 0 },
    null,
  ];
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const tl = translatorFor(locale);
    for (const entry of counts) {
      const sentence = buildHeaderSentence(entry, tl);
      assert.ok(sentence.length > 0, `${locale} header`);
      assert.doesNotMatch(sentence, /[{}]|\u2014/, `${locale} header has a stray brace or em dash: ${sentence}`);
      if (entry) assert.match(sentence, new RegExp(`\\b${entry.passedCount}\\b`), `${locale} header keeps the passed count`);
    }
    for (const args of [
      { programSlug: null, programTitle: null },
      { programSlug: 'p', programTitle: 'Program Title' },
      { programSlug: 'p', programTitle: null },
    ]) {
      const empty = buildEmptyState(args, tl);
      assert.ok(empty.title.length > 0 && empty.description.length > 0 && empty.primaryAction.label.length > 0, locale);
      assert.doesNotMatch(`${empty.title}${empty.description}${empty.primaryAction.label}`, /[{}]|\u2014/, locale);
      assert.equal(empty.primaryAction.href, '/dashboard/program');
    }
    // The enrolled-program name reaches the title.
    assert.ok(buildEmptyState({ programSlug: 'p', programTitle: 'Program Title' }, tl).title.includes('Program Title'), locale);
  }
});
