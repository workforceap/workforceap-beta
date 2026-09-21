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
  getHomeTourForRole,
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

test('counselor.home (wave 2) is written for Today and walks the path a new counselor uses', () => {
  const tour = TOUR_REGISTRY['counselor.home'];
  assert.equal(tour.role, 'counselor');
  assert.equal(tour.route, '/counselor/today');
  assert.deepEqual(
    tour.steps.map((s) => s.target),
    [
      'tour-today-attention',
      'tour-today-queue',
      'tour-today-roster',
      'tour-nav-members',
      'tour-nav-at-risk',
      'tour-nav-messages',
      'tour-help',
    ],
  );
  assert.equal(getHomeTourForRole('counselor')?.key, 'counselor.home');
  assert.equal(getHomeTourForRole('member')?.key, 'member.home');
  assert.equal(getHomeTourForRole('admin')?.key, 'admin.home');
  assert.equal(getHomeTourForRole('__proto__'), null);
});

for (const locale of REVIEWED_LOCALES) {
  test(`${locale}.json: Help menu, offer strip and counselor offer copy resolve`, () => {
    const tours = loadTours(locale);
    for (const key of ['help.label', 'help.takeTour', 'help.guide', 'offer.take', 'offer.dismiss', 'counselor.home.offer.title', 'counselor.home.offer.body']) {
      const value = resolve(tours, key);
      assert.equal(typeof value, 'string', `tours.${key} missing in ${locale}.json`);
      assert.ok((value as string).trim().length > 0, `tours.${key} empty in ${locale}.json`);
    }
  });
}

test('counselor step copy names the record tabs and where notes live', () => {
  const en = loadTours('en');
  const record = resolve(en, 'counselor.home.memberRecord.body') as string;
  for (const tab of ['Profile', 'Training', 'Notes', 'Messages']) assert.match(record, new RegExp(tab));
  assert.match(record, /Notes tab/);
  assert.match(resolve(en, 'counselor.home.help.body') as string, /reopens this tour/);
});

test('member.home (wave 3) is written for the /dashboard overview and walks home → program → jobs → AI tools → messages → profile → help', () => {
  const tour = TOUR_REGISTRY['member.home'];
  assert.equal(tour.role, 'member');
  assert.equal(tour.route, '/dashboard');
  assert.equal(tour.version, 3, 'v3 re-tours everyone who finished the v2 walk-through');
  assert.deepEqual(
    tour.steps.map((s) => s.target),
    ['tour-dashboard', 'tour-programs', 'tour-jobs', 'tour-ai-tools', 'tour-messages', 'tour-account', 'tour-help'],
  );
  assert.ok(tour.steps.length >= 6 && tour.steps.length <= 8);
  assert.equal(tour.steps[tour.steps.length - 1].target, 'tour-help', 'ends on the Help anchor that reopens it');
  assert.equal(tour.steps[tour.steps.length - 1].placement, 'bottom');
  assert.equal(getHomeTourForRole('member')?.key, 'member.home');
});

test('employer.home (wave 3) is written for the overview and walks post → review → pipeline → messages → settings', () => {
  const tour = TOUR_REGISTRY['employer.home'];
  assert.equal(tour.role, 'employer');
  assert.equal(tour.route, '/employer');
  assert.equal(tour.version, 3, 'v3 re-tours everyone who finished the v2 rail walk-through');
  assert.deepEqual(
    tour.steps.map((s) => s.target),
    ['tour-overview', 'tour-post-job', 'tour-applicants', 'tour-pipeline', 'tour-messages', 'tour-settings', 'tour-help'],
  );
  assert.ok(tour.steps.length >= 5 && tour.steps.length <= 7);
  assert.equal(getHomeTourForRole('employer')?.key, 'employer.home');
});

test('partner.home (wave 3) is written for the overview and walks referrals → members → attention → payouts → exports → messages', () => {
  const tour = TOUR_REGISTRY['partner.home'];
  assert.equal(tour.role, 'partner');
  assert.equal(tour.route, '/partner');
  assert.equal(tour.version, 3);
  assert.deepEqual(
    tour.steps.map((s) => s.target),
    ['tour-referral-link', 'tour-members', 'tour-attention', 'tour-payouts', 'tour-exports', 'tour-messages', 'tour-help'],
  );
  assert.ok(tour.steps.length >= 5 && tour.steps.length <= 7);
  assert.equal(getHomeTourForRole('partner')?.key, 'partner.home');
});

test('every persona home tour ends on the Help anchor that reopens it', () => {
  for (const key of ['member.home', 'employer.home', 'partner.home', 'counselor.home', 'admin.home'] as const) {
    const steps = TOUR_REGISTRY[key].steps;
    assert.equal(steps[steps.length - 1].target, 'tour-help', key);
  }
});

for (const locale of REVIEWED_LOCALES) {
  test(`${locale}.json: member offer and step copy resolves`, () => {
    const tours = loadTours(locale);
    const keys = ['member.home.offer.title', 'member.home.offer.body'];
    for (const step of TOUR_REGISTRY['member.home'].steps) keys.push(step.titleKey, step.bodyKey);
    for (const key of keys) {
      const value = resolve(tours, key);
      assert.equal(typeof value, 'string', `tours.${key} missing in ${locale}.json`);
      assert.ok((value as string).trim().length > 0, `tours.${key} empty in ${locale}.json`);
    }
  });
}

for (const locale of REVIEWED_LOCALES) {
  test(`${locale}.json: employer and partner offer copy resolves`, () => {
    const tours = loadTours(locale);
    for (const key of ['employer.home.offer.title', 'employer.home.offer.body', 'partner.home.offer.title', 'partner.home.offer.body']) {
      const value = resolve(tours, key);
      assert.equal(typeof value, 'string', `tours.${key} missing in ${locale}.json`);
      assert.ok((value as string).trim().length > 0, `tours.${key} empty in ${locale}.json`);
    }
  });
}

test('member step copy names the surfaces the steps point at', () => {
  const en = loadTours('en');
  assert.match(resolve(en, 'member.home.dashboard.body') as string, /My program/);
  assert.match(resolve(en, 'member.home.program.body') as string, /certif/i);
  assert.match(resolve(en, 'member.home.jobs.body') as string, /Job board/);
  assert.match(resolve(en, 'member.home.profile.body') as string, /Profile & settings/);
  assert.match(resolve(en, 'member.home.help.body') as string, /reopens this tour/);
});

test('employer and partner step copy names the surfaces the steps point at', () => {
  const en = loadTours('en');
  assert.match(resolve(en, 'employer.home.postJob.body') as string, /two minutes/);
  assert.match(resolve(en, 'employer.home.overview.body') as string, /Work queue/);
  assert.match(resolve(en, 'employer.home.pipeline.body') as string, /Match history/);
  assert.match(resolve(en, 'employer.home.help.body') as string, /reopens this tour/);
  assert.match(resolve(en, 'partner.home.payouts.body') as string, /verified placement/);
  assert.match(resolve(en, 'partner.home.exports.body') as string, /CSV/);
  assert.match(resolve(en, 'partner.home.help.body') as string, /reopens this tour/);
});

test('admin.home (wave 4) is written for the /admin Command Center and walks command center → overview → students → messages → programs → training progress → settings → help', () => {
  const tour = TOUR_REGISTRY['admin.home'];
  assert.equal(tour.role, 'admin');
  assert.equal(tour.route, '/admin');
  assert.equal(tour.version, 1, 'first admin wave');
  assert.deepEqual(
    tour.steps.map((s) => s.target),
    [
      'tour-command-center',
      'tour-overview',
      'tour-students',
      'tour-messages',
      'tour-programs',
      'tour-training-progress',
      'tour-settings',
      'tour-help',
    ],
  );
  assert.ok(tour.steps.length >= 7 && tour.steps.length <= 8);
  assert.equal(tour.steps[tour.steps.length - 1].target, 'tour-help', 'ends on the Help anchor that reopens it');
  assert.equal(tour.steps[tour.steps.length - 1].placement, 'bottom');
  assert.equal(getHomeTourForRole('admin')?.key, 'admin.home');
  assert.ok(isTourKey('admin.home'));
  assert.equal(getTour('admin.home'), tour);
});

for (const locale of REVIEWED_LOCALES) {
  test(`${locale}.json: admin offer and step copy resolves`, () => {
    const tours = loadTours(locale);
    const keys = ['admin.home.offer.title', 'admin.home.offer.body'];
    for (const step of TOUR_REGISTRY['admin.home'].steps) keys.push(step.titleKey, step.bodyKey);
    for (const key of keys) {
      const value = resolve(tours, key);
      assert.equal(typeof value, 'string', `tours.${key} missing in ${locale}.json`);
      assert.ok((value as string).trim().length > 0, `tours.${key} empty in ${locale}.json`);
    }
  });
}

test('admin step copy names the surfaces the steps point at', () => {
  const en = loadTours('en');
  assert.match(resolve(en, 'admin.home.commandCenter.body') as string, /What needs you today/);
  assert.match(resolve(en, 'admin.home.overview.body') as string, /Command Center/);
  assert.match(resolve(en, 'admin.home.students.body') as string, /roster/i);
  assert.match(resolve(en, 'admin.home.messages.body') as string, /reply/);
  assert.match(resolve(en, 'admin.home.programs.body') as string, /Program requests/);
  assert.match(resolve(en, 'admin.home.trainingProgress.body') as string, /Coursera/);
  assert.match(resolve(en, 'admin.home.settings.body') as string, /under Security & system,/);
  assert.match(resolve(en, 'admin.home.help.body') as string, /reopens this tour/);
});
