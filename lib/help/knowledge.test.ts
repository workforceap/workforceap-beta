import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  HELP_KNOWLEDGE,
  HELP_PERSONAS,
  currentFeature,
  detectOtherPersonas,
  findRelevantFeatures,
  personaForPathname,
} from './knowledge';
import { TOUR_REGISTRY, isTourKey } from '../tours/registry';

const auditManifest = readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'portal-audit-paths.mjs'), 'utf8');

test('every knowledge route is a checked-in portal audit path for that persona', () => {
  for (const persona of HELP_PERSONAS) {
    const knowledge = HELP_KNOWLEDGE[persona];
    for (const feature of knowledge.features) {
      assert.ok(
        feature.route.startsWith(knowledge.routePrefix),
        `${persona}: ${feature.route} is outside ${knowledge.routePrefix}`,
      );
      // A `#section` anchor lands on its page, so the page is what must be audited.
      const [pagePath, fragment] = feature.route.split('#');
      if (fragment !== undefined) assert.match(fragment, /^[a-z][a-z0-9-]*$/, `${persona}: ${feature.route} has a malformed fragment`);
      assert.ok(auditManifest.includes(`'${pagePath}'`), `${persona}: ${pagePath} is not in portal-audit-paths.mjs`);
    }
    if (knowledge.guideHref) {
      assert.ok(auditManifest.includes(`'${knowledge.guideHref}'`), `${persona}: guide ${knowledge.guideHref} is not audited`);
    }
  }
});

test('tour keys point at registered tours written for the same persona', () => {
  for (const persona of HELP_PERSONAS) {
    const key = HELP_KNOWLEDGE[persona].tourKey;
    if (key === null) continue;
    assert.ok(isTourKey(key), `${persona}: ${key} is not a registry tour`);
    assert.equal(TOUR_REGISTRY[key].role, persona);
  }
});

test('features carry summaries and lower-case keywords, with no duplicate routes', () => {
  for (const persona of HELP_PERSONAS) {
    const routes = new Set<string>();
    for (const feature of HELP_KNOWLEDGE[persona].features) {
      assert.ok(feature.summary.length > 20, `${feature.route} summary too short`);
      assert.ok(feature.keywords.length > 0, `${feature.route} has no keywords`);
      for (const kw of feature.keywords) assert.equal(kw, kw.toLowerCase(), `${kw} is not lower-case`);
      assert.ok(!routes.has(feature.route), `${persona}: duplicate ${feature.route}`);
      routes.add(feature.route);
    }
  }
});

test('personaForPathname maps each portal prefix and ignores the rest', () => {
  assert.equal(personaForPathname('/dashboard'), 'member');
  assert.equal(personaForPathname('/dashboard/ai-tools/resume-studio?view=score'), 'member');
  assert.equal(personaForPathname('/counselor/today'), 'counselor');
  assert.equal(personaForPathname('/employer/jobs/new'), 'employer');
  assert.equal(personaForPathname('/partner'), 'partner');
  assert.equal(personaForPathname('/admin/members'), 'admin');
  assert.equal(personaForPathname('/administrator'), null);
  assert.equal(personaForPathname('/help'), null);
  assert.equal(personaForPathname(''), null);
  assert.equal(personaForPathname(undefined), null);
});

test('findRelevantFeatures leads with the current page, then keyword matches', () => {
  const features = findRelevantFeatures('member', 'how do I upload my resume?', '/dashboard/jobs');
  assert.equal(features[0]?.route, '/dashboard/jobs');
  assert.ok(features.some((f) => f.route === '/dashboard/ai-tools/resume-studio'));
  assert.ok(features.length <= 4);
});

test('goal questions point members at the goals section of My career plan', () => {
  // WAP-188: goals are created and edited on /dashboard/career-brief#goals, not the home dashboard.
  const features = findRelevantFeatures('member', 'How do I set my goals?');
  assert.equal(features[0]?.route, '/dashboard/career-brief#goals');
  const goals = HELP_KNOWLEDGE.member.features.filter((f) => f.keywords.includes('goals'));
  assert.deepEqual(goals.map((f) => f.route), ['/dashboard/career-brief#goals']);
  assert.match(goals[0]!.summary, /goals/);
  const plan = HELP_KNOWLEDGE.member.features.find((f) => f.route === '/dashboard/career-brief');
  assert.match(plan?.summary ?? '', /goals/);
  // The page itself still resolves to My career plan; the anchor entry never shadows it.
  assert.equal(currentFeature('member', '/dashboard/career-brief')?.route, '/dashboard/career-brief');
});

test('target-role questions go to Find your career, never to My career plan', () => {
  // The career brief shows no target roles; Find your career is where a member
  // picks one (interest profiler) or maps the skills one needs (skill mapping).
  const features = findRelevantFeatures('member', 'Where do I see my target role?');
  assert.equal(features[0]?.route, '/dashboard/learning/find-your-career');
  assert.ok(!features.some((f) => f.route.startsWith('/dashboard/career-brief')), features.map((f) => f.route).join(', '));
  const plan = HELP_KNOWLEDGE.member.features.find((f) => f.route === '/dashboard/career-brief');
  assert.ok(!plan?.keywords.includes('target role'));
  assert.doesNotMatch(plan?.summary ?? '', /target role/i);
});

test('findRelevantFeatures never returns another persona\'s pages', () => {
  const features = findRelevantFeatures('member', 'approve applicants in the admin command center');
  for (const f of features) assert.ok(f.route.startsWith('/dashboard'), f.route);
});

test('currentFeature picks the longest matching route', () => {
  assert.equal(currentFeature('member', '/dashboard/ai-tools/interview-practice')?.route, '/dashboard/ai-tools/interview-practice');
  assert.equal(currentFeature('member', '/dashboard/ai-tools/cover-letter')?.route, '/dashboard/ai-tools');
  assert.equal(currentFeature('counselor', '/counselor/students/abc')?.route, '/counselor/students');
  assert.equal(currentFeature('member', '/counselor/today'), null);
});

test('detectOtherPersonas flags admin and other-portal questions, not shared nouns', () => {
  assert.deepEqual(detectOtherPersonas('member', 'how do admins approve applicants?'), ['admin']);
  assert.deepEqual(detectOtherPersonas('member', 'where is the /counselor/at-risk list?'), ['counselor']);
  assert.deepEqual(detectOtherPersonas('counselor', 'how do I change my profile and read messages?'), []);
  assert.deepEqual(detectOtherPersonas('member', 'how do I message my counselor?'), []);
  assert.deepEqual(detectOtherPersonas('admin', 'how do I toggle a feature flag as an admin?'), []);
});
