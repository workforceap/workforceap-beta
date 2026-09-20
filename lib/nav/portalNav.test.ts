import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEMBER_PORTAL_NAV_ITEMS } from './portalNav';
import { MEMBER_PORTAL_NAV_ITEMS_I18N } from './portalNav.i18n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

test('Job board, Training progress, and AI Career Tools stay in the member primary rail', () => {
  const jobs = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/jobs');
  const progress = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/readiness');
  const tools = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/ai-tools');
  assert.equal(jobs?.group, 'primary');
  assert.equal(jobs?.label, 'Job board');
  assert.equal(progress?.group, 'primary');
  assert.equal(progress?.label, 'My progress');
  assert.equal(tools?.group, 'primary');
  assert.equal(tools?.label, 'AI Career Tools');
});

test('i18n Job board, Training progress, and AI Career Tools stay in the member primary rail', () => {
  const jobs = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/jobs');
  const progress = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/readiness');
  const tools = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/ai-tools');
  assert.equal(jobs?.group, 'primary');
  assert.equal(progress?.group, 'primary');
  assert.equal(tools?.group, 'primary');
});

test('Training preassessment nav points at the assessment page, not AI tools', () => {
  const item = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.label === 'Training preassessment');
  assert.ok(item, 'expected a Training preassessment nav item');
  assert.equal(item.href, '/dashboard/assessment');
  assert.ok(item.aliases?.includes('/dashboard/skills-assessment'));
  assert.ok(item.aliases?.includes('/dashboard/assessments'));
  assert.notEqual(item.href, '/dashboard/ai-tools');
});

test('i18n Training Preassessment nav matches the canonical assessment path', () => {
  const item = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.label === 'nav:trainingPreassessment');
  assert.ok(item, 'expected an i18n Training Preassessment nav item');
  assert.equal(item.href, '/dashboard/assessment');
  assert.ok(item.aliases?.includes('/dashboard/skills-assessment'));
});

test('legacy skills-assessment URL redirects to Training Preassessment, not AI tools', () => {
  const page = source('app/(portal)/dashboard/skills-assessment/page.tsx');
  assert.match(page, /permanentRedirect\(['"]\/dashboard\/assessment['"]\)/);
  assert.doesNotMatch(page, /\/dashboard\/ai-tools/);
});

test('plural assessments alias redirects to Training Preassessment', () => {
  const page = source('app/(portal)/dashboard/assessments/page.tsx');
  assert.match(page, /permanentRedirect\(['"]\/dashboard\/assessment['"]\)/);
});

test('labeled preassessment CTAs use the assessment page', () => {
  const guide = source('app/(portal)/dashboard/guide/page.tsx');
  assert.match(guide, /title: 'Complete your Training Preassessment'/);
  assert.match(guide, /href: '\/dashboard\/assessment'/);
  assert.doesNotMatch(guide, /href: '\/dashboard\/skills-assessment'/);

  const home = source('components/portal/DashboardHomeClient.tsx');
  assert.match(home, /href: '\/dashboard\/assessment'/);
  assert.doesNotMatch(home, /href: '\/dashboard\/skills-assessment'/);

  const learningHub = source('components/portal/LearningHubEnrolledCourses.tsx');
  assert.match(learningHub, /href="\/dashboard\/assessment"/);
  assert.doesNotMatch(learningHub, /href="\/dashboard\/skills-assessment"/);
});

test('completed Skills check stays on the page instead of dumping home', () => {
  const page = source('app/(portal)/dashboard/assessment/page.tsx');
  assert.match(page, /Skills check/);
  assert.match(page, /Preassessment complete/);
  assert.doesNotMatch(page, /if \(dbUser\.assessmentCompleted\) \{\s*redirect\('\/dashboard'\)/);
  assert.doesNotMatch(page, /Skills snapshot/);
});
