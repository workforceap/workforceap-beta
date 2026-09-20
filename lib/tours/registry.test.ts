import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LEGACY_PORTAL_TOUR_KEY,
  LEGACY_TOUR_VERSION,
  TOUR_KEYS,
  TOUR_REGISTRY,
  TOUR_STATUSES,
  getTour,
  isTourKey,
  isTourStatus,
  listTours,
  toTourSteps,
} from './registry';

type Messages = Record<string, unknown>;

/** Reviewed locales (lib/i18n/config.ts REVIEWED_LOCALES); fr/pt fall back to en at runtime. */
const REVIEWED_LOCALES = ['en', 'es'] as const;

function loadTours(locale: string): Messages {
  const raw = readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as Messages;
  const tours = parsed.tours;
  assert.equal(typeof tours, 'object', `${locale}.json must have a tours namespace`);
  return tours as Messages;
}

function resolve(messages: Messages, dotted: string): unknown {
  let cur: unknown = messages;
  for (const part of dotted.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Messages)[part];
  }
  return cur;
}

const CHROME_KEYS = ['close', 'stepOf', 'back', 'skip', 'next', 'done', 'announceStep'];
const PLACEMENTS = ['top', 'bottom', 'left', 'right'];

test('registry keys are unique, well-formed and self-describing', () => {
  assert.deepEqual([...new Set(TOUR_KEYS)], [...TOUR_KEYS]);
  for (const key of TOUR_KEYS) {
    const tour = TOUR_REGISTRY[key];
    assert.equal(tour.key, key);
    assert.match(key, /^[a-z]+(\.[a-zA-Z]+)+$/, `${key} must be dotted lower-case segments`);
    assert.ok(Number.isInteger(tour.version) && tour.version >= 1, `${key} version`);
    assert.ok(tour.route.startsWith('/'), `${key} route`);
    assert.ok(tour.steps.length > 0, `${key} has steps`);
    const targets = tour.steps.map((s) => s.target);
    assert.deepEqual([...new Set(targets)], targets, `${key} targets are unique`);
    for (const step of tour.steps) {
      assert.match(step.target, /^tour-[a-z0-9-]+$/, `${key} target ${step.target}`);
      assert.ok(PLACEMENTS.includes(step.placement), `${key} placement ${step.placement}`);
      assert.ok(step.titleKey.startsWith(`${key}.`), `${key} titleKey scoped to tour`);
      assert.ok(step.bodyKey.startsWith(`${key}.`), `${key} bodyKey scoped to tour`);
      assert.ok(step.titleKey.endsWith('.title') && step.bodyKey.endsWith('.body'));
    }
  }
});

for (const locale of REVIEWED_LOCALES) {
  test(`${locale}.json: every registry step and chrome key resolves to a non-empty string`, () => {
    const tours = loadTours(locale);
    for (const chrome of CHROME_KEYS) {
      const value = resolve(tours, `chrome.${chrome}`);
      assert.equal(typeof value, 'string', `tours.chrome.${chrome} (${locale})`);
      assert.ok((value as string).trim().length > 0, `tours.chrome.${chrome} empty (${locale})`);
    }
    for (const tour of listTours()) {
      for (const step of tour.steps) {
        for (const key of [step.titleKey, step.bodyKey]) {
          const value = resolve(tours, key);
          assert.equal(typeof value, 'string', `tours.${key} missing in ${locale}.json`);
          assert.ok((value as string).trim().length > 0, `tours.${key} empty in ${locale}.json`);
        }
      }
    }
  });
}

test('interpolated chrome strings keep their placeholders in every reviewed locale', () => {
  for (const locale of REVIEWED_LOCALES) {
    const tours = loadTours(locale);
    const stepOf = resolve(tours, 'chrome.stepOf') as string;
    const announce = resolve(tours, 'chrome.announceStep') as string;
    for (const placeholder of ['{current}', '{total}']) {
      assert.ok(stepOf.includes(placeholder), `${locale} stepOf ${placeholder}`);
      assert.ok(announce.includes(placeholder), `${locale} announceStep ${placeholder}`);
    }
    assert.ok(announce.includes('{title}'), `${locale} announceStep {title}`);
  }
});

test('member step 1 no longer points at the retired My Training route', () => {
  const en = loadTours('en');
  const body = resolve(en, 'member.home.dashboard.body') as string;
  assert.doesNotMatch(body, /My Training/);
  assert.match(body, /My program/);
});

test('legacy portal names map onto registered home tours', () => {
  assert.equal(LEGACY_TOUR_VERSION, 1);
  for (const [portal, key] of Object.entries(LEGACY_PORTAL_TOUR_KEY)) {
    assert.ok(isTourKey(key), `${portal} → ${key}`);
    assert.equal(TOUR_REGISTRY[key].role, portal);
    assert.ok(TOUR_REGISTRY[key].version > LEGACY_TOUR_VERSION, `${key} must supersede the legacy timestamp`);
  }
});

test('lookups reject unknown keys and statuses', () => {
  assert.equal(getTour('member.home')?.route, '/dashboard');
  assert.equal(getTour('nope.home'), null);
  assert.equal(getTour('__proto__'), null);
  assert.equal(isTourKey(42), false);
  assert.deepEqual([...TOUR_STATUSES], ['STARTED', 'COMPLETED', 'DISMISSED']);
  assert.ok(isTourStatus('DISMISSED'));
  assert.equal(isTourStatus('completed'), false);
});

test('toTourSteps preserves order, targets, keys and placement', () => {
  const tour = TOUR_REGISTRY['employer.home'];
  const steps = toTourSteps(tour);
  assert.equal(steps.length, tour.steps.length);
  steps.forEach((step, i) => {
    assert.equal(step.targetId, tour.steps[i].target);
    assert.equal(step.titleKey, tour.steps[i].titleKey);
    assert.equal(step.bodyKey, tour.steps[i].bodyKey);
    assert.equal(step.placement, tour.steps[i].placement);
  });
  assert.equal(steps[steps.length - 1].placement, 'bottom');
});
