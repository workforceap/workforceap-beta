import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTranslator } from 'next-intl';

/**
 * The `skillMissions` catalog is read by the missions page, the Learning hub
 * panel and the training practice dialog. These checks keep the four locale
 * files in step: same keys, every message parses as ICU and formats with the
 * values the components pass, no stray apostrophe quoting, no em dashes.
 */
const LOCALES = ['en', 'es', 'fr', 'pt'] as const;

type Node = string | { [key: string]: Node };

function catalog(locale: string): { [key: string]: Node } {
  const all = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as { skillMissions: { [key: string]: Node } };
  return all.skillMissions;
}

function flatten(node: Node, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix] = node;
    return out;
  }
  for (const [key, child] of Object.entries(node)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

const SAMPLE = {
  passed: 3,
  total: 8,
  ready: 2,
  retry: 1,
  count: 4,
  pct: 38,
  course: 'Course Name',
  date: 'Oct 3',
  minutes: 15,
  name: 'Program Name',
  current: 2,
  correct: 3,
  min: 20,
  max: 4000,
};

test('every locale carries exactly the English skillMissions keys', () => {
  const english = Object.keys(flatten(catalog('en'))).sort();
  assert.ok(english.length > 80, 'the English catalog is not empty');
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(flatten(catalog(locale))).sort(), english, `${locale} keys`);
  }
});

test('every skillMissions message formats in every locale with the values the components pass', () => {
  for (const locale of LOCALES) {
    const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
    const t = createTranslator({
      locale,
      messages,
      namespace: 'skillMissions',
      onError: (error) => {
        throw error;
      },
    });
    for (const key of Object.keys(flatten(catalog(locale)))) {
      const out = t.rich(key, { ...SAMPLE, b: (chunks) => chunks });
      const text = Array.isArray(out) ? out.join('') : String(out);
      assert.ok(text.trim().length > 0, `${locale} ${key} renders text`);
      assert.doesNotMatch(text, /[{}<>]/, `${locale} ${key} leaves a brace or tag in: ${text}`);
    }
  }
});

test('translations avoid ASCII apostrophes (ICU quoting) and em dashes', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flatten(catalog(locale)))) {
      assert.doesNotMatch(value, /—/, `${locale} ${key} has an em dash`);
      if (locale !== 'en') assert.doesNotMatch(value, /'/, `${locale} ${key} has an ASCII apostrophe`);
    }
  }
});

test('the rich-text tags the panel relies on exist in every locale', () => {
  for (const locale of LOCALES) {
    const flat = flatten(catalog(locale));
    assert.match(flat['panel.lockedHint']!, /<b>\{course\}<\/b>/, locale);
    assert.match(flat['panel.progressPercent']!, /<b>\{pct\}[^<]*<\/b>/, locale);
  }
});

test('every evaluate failure code the route can return has a translated dialog message', () => {
  // Keep in step with MissionEvalErrorCode (lib/ai/skillMissionEval.ts).
  const codes = [
    'unauthorized',
    'rate_limited',
    'mission_not_found',
    'not_enrolled',
    'course_incomplete',
    'attempt_cap',
    'coach_unavailable',
    'save_failed',
    'server_error',
  ];
  for (const locale of LOCALES) {
    const flat = flatten(catalog(locale));
    for (const code of codes) assert.ok((flat[`challenge.errors.${code}`] ?? '').length > 0, `${locale} ${code}`);
  }
});
