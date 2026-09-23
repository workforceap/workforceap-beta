import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_PORTAL_NAV_ITEMS,
  GROUP_ORDER,
  NAV_GROUP_ALWAYS_OPEN,
  NAV_GROUP_COLLAPSED_BY_DEFAULT,
  NAV_GROUP_LABELS,
  navChildrenOf,
  navItemsForActiveRoute,
  navTopLevelItems,
} from './portalNav';
import { getBestActiveHref } from './activeRoute';
import { MEMBER_PORTAL_NAV_ITEMS } from './portalNav';
import { MEMBER_PORTAL_NAV_ITEMS_I18N } from './portalNav.i18n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

// WAP-189 (owner-approved 2026-09-23): the always-visible member rail is exactly
// these five rows, in this order. It supersedes the seven-row PR #2322 order.
const MEMBER_PRIMARY_HREFS = [
  '/dashboard',
  '/dashboard/program',
  '/dashboard/jobs',
  '/dashboard/ai-tools',
  '/dashboard/messages',
];

test('the member primary rail is exactly Home, My program, Job board, AI Career Tools, Messages', () => {
  const primary = MEMBER_PORTAL_NAV_ITEMS.filter((entry) => entry.group === 'primary');
  assert.deepEqual(primary.map((entry) => entry.href), MEMBER_PRIMARY_HREFS);
  assert.deepEqual(primary.map((entry) => entry.label), ['Home', 'My program', 'Job board', 'AI Career Tools', 'Messages']);
});

test('Job board and AI Career Tools stay in the member primary rail', () => {
  const jobs = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/jobs');
  const tools = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/ai-tools');
  assert.equal(jobs?.group, 'primary');
  assert.equal(jobs?.label, 'Job board');
  assert.equal(tools?.group, 'primary');
  assert.equal(tools?.label, 'AI Career Tools');
});

test('My progress and Skill missions live in the Training & progress group (WAP-189)', () => {
  const progress = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/readiness');
  const missions = MEMBER_PORTAL_NAV_ITEMS.find((entry) => entry.href === '/dashboard/missions');
  assert.equal(progress?.group, 'insights');
  assert.equal(progress?.label, 'My progress');
  assert.equal(missions?.group, 'insights');
  assert.equal(missions?.label, 'Skill missions');
  // Never under Account & support: the e2e tab-order pin covers that group.
  assert.notEqual(progress?.group, 'manage');
  assert.notEqual(missions?.group, 'manage');
});

test('i18n Job board and AI Career Tools stay primary; My progress joins Training & progress', () => {
  const jobs = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/jobs');
  const progress = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/readiness');
  const tools = MEMBER_PORTAL_NAV_ITEMS_I18N.find((entry) => entry.href === '/dashboard/ai-tools');
  assert.equal(jobs?.group, 'primary');
  assert.equal(progress?.group, 'insights');
  assert.equal(tools?.group, 'primary');
  assert.deepEqual(
    MEMBER_PORTAL_NAV_ITEMS_I18N.filter((entry) => entry.group === 'primary').map((entry) => entry.href),
    MEMBER_PRIMARY_HREFS,
  );
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

  // The member home's preassessment CTA comes from the next-best-action
  // builder the kit home renders (the legacy DashboardHomeClient is gone, WAP-195).
  const home = source('lib/member/nextBestActions.ts');
  assert.match(home, /title: 'Complete your Training Preassessment'/);
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

// ── Admin rail structure (sidebar consolidation, 2026-09-21; queue-first, WAP-190) ──

const DAILY_WORK = [
  '/admin',
  '/admin/command-center?queue=applications',
  '/admin/wioa-screening',
  '/admin/certifications',
  '/admin/program-change-requests',
  '/admin/students',
  '/admin/messages',
];

test('admin rail: every destination has a unique href and the grouped rail keeps at most 22 top-level rows', () => {
  const hrefs = ADMIN_PORTAL_NAV_ITEMS.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length, 'duplicate admin href');
  const top = navTopLevelItems(ADMIN_PORTAL_NAV_ITEMS);
  // 20 before WAP-190, plus Applications (new) and Funding eligibility / Certificates
  // promoted into Daily work; every section but Daily work starts closed.
  assert.ok(top.length >= 15 && top.length <= 22, `expected 15–22 top-level rows, got ${top.length}`);
  assert.ok(ADMIN_PORTAL_NAV_ITEMS.length >= 52, 'no destination was removed; Applications was added');
});

test('admin rail: every pre-consolidation destination is still present', () => {
  const expected = [
    '/admin', '/admin/overview', '/admin/students', '/admin/messages', '/admin/programs',
    '/admin/program-change-requests', '/admin/training-progress', '/admin/assessments', '/admin/certifications',
    '/admin/career-mappings', '/admin/wioa-screening', '/admin/partners', '/admin/employers',
    '/admin/employer-screening-packs', '/admin/jobs', '/admin/mentors', '/admin/counselors', '/admin/subgroups',
    '/admin/board', '/admin/outcomes', '/admin/placements', '/admin/placement-surveys', '/admin/analytics',
    '/admin/blog', '/admin/invites', '/admin/sessions', '/admin/pipeline', '/admin/members/duplicates',
    '/admin/users', '/admin/exports', '/admin/coursera', '/admin/metrics', '/admin/weekly-recap', '/admin/ai-tools',
    '/admin/analytics/ai-efficacy', '/admin/diagnostics', '/admin/crons', '/admin/health',
    '/admin/what-workforceap-does', '/admin/audit-logs', '/admin/webhook-events', '/admin/email-crons',
    '/admin/email-templates', '/admin/feedback', '/admin/growth', '/admin/feature-flags', '/admin/agent-inbox',
    '/admin/data-retention', '/admin/csp-report', '/admin/settings',
  ];
  const hrefs = new Set(ADMIN_PORTAL_NAV_ITEMS.map((item) => item.href));
  for (const href of expected) assert.ok(hrefs.has(href), `missing admin destination ${href}`);
});

test('admin rail: Daily work is the first, always-open section and holds exactly the seven queue-clearing rows, top-level', () => {
  assert.equal(ADMIN_PORTAL_NAV_ITEMS[0].group, 'dailyWork');
  assert.equal(GROUP_ORDER.indexOf('dailyWork'), GROUP_ORDER.indexOf('runTheOrg') - 1, 'Daily work renders before every other admin section');
  assert.equal(NAV_GROUP_LABELS.dailyWork, 'Daily work');
  assert.ok(!NAV_GROUP_COLLAPSED_BY_DEFAULT.dailyWork, 'Daily work is open by default');
  assert.deepEqual(NAV_GROUP_ALWAYS_OPEN, { dailyWork: true }, 'Daily work cannot be closed; no other section is pinned open');
  const top = navTopLevelItems(ADMIN_PORTAL_NAV_ITEMS).filter((item) => item.group === 'dailyWork');
  assert.deepEqual(top.map((item) => item.href), DAILY_WORK);
  assert.deepEqual(top.map((item) => item.label), [
    'Today', 'Applications', 'Funding eligibility', 'Certificates', 'Program requests', 'Students', 'Messages',
  ]);
});

test('admin rail: Today keeps the home anchor; Applications opens the decision workbench and lights on its own queue only', () => {
  const byHref = new Map(ADMIN_PORTAL_NAV_ITEMS.map((item) => [item.href, item]));
  const today = byHref.get('/admin');
  assert.equal(today?.label, 'Today');
  assert.equal(today?.exact, true);
  assert.equal(today?.tourTarget, 'tour-command-center');

  const applications = byHref.get('/admin/command-center?queue=applications');
  assert.ok(applications, 'Applications row');
  assert.ok(!applications.requiresSuperAdminContext, 'org admins decide applications too');
  assert.equal(applications.badgeKey, 'admin_applications_pending');
  // No bare-pathname alias: it would light Applications on every workbench
  // queue and on the metrics view "All queues" opens.
  assert.equal(applications.aliases, undefined);
  const links = navItemsForActiveRoute(ADMIN_PORTAL_NAV_ITEMS);
  const at = (query: string) => getBestActiveHref('/admin/command-center', links, new URLSearchParams(query));
  assert.equal(at('queue=applications'), '/admin/command-center?queue=applications');
  assert.equal(at('queue=applications&page=2'), '/admin/command-center?queue=applications');
  assert.equal(at('page=3&queue=applications&ui=legacy'), '/admin/command-center?queue=applications');
  for (const query of ['queue=needs-reply', 'queue=at-risk', 'queue=interviewing', 'queue=interviewing&page=2', '', 'ui=legacy']) {
    assert.equal(at(query), null, `?${query} marks no rail row`);
  }
  // Without the page's query (pathname-only callers) the query-string row never matches.
  assert.equal(getBestActiveHref('/admin/command-center', links), null);
  assert.equal(getBestActiveHref('/admin', links), '/admin');
  assert.equal(getBestActiveHref('/admin/wioa-screening', links), '/admin/wioa-screening');
  assert.equal(getBestActiveHref('/admin/certifications', links), '/admin/certifications');
});

test('admin rail: Reporting is one top-level hub row with the reporting pages nested under it', () => {
  const hub = ADMIN_PORTAL_NAV_ITEMS.find((item) => item.href === '/admin/reporting');
  assert.ok(hub && !hub.parentHref && hub.group === 'reporting');
  const children = navChildrenOf(ADMIN_PORTAL_NAV_ITEMS, '/admin/reporting').map((item) => item.href);
  for (const href of ['/admin/analytics', '/admin/outcomes', '/admin/board']) assert.ok(children.includes(href), href);
  assert.equal(navTopLevelItems(ADMIN_PORTAL_NAV_ITEMS).filter((item) => item.group === 'reporting').length, 1);
});

test('admin rail: a child shares its parent section, and a gated parent never hides an ungated child', () => {
  const byHref = new Map(ADMIN_PORTAL_NAV_ITEMS.map((item) => [item.href, item]));
  for (const item of ADMIN_PORTAL_NAV_ITEMS) {
    if (!item.parentHref) continue;
    const parent = byHref.get(item.parentHref);
    assert.ok(parent, `${item.href}: parent ${item.parentHref} is not a rail row`);
    assert.ok(!parent.parentHref, `${item.href}: parent must be top-level`);
    assert.equal(item.group, parent.group, `${item.href}: child must share its parent's section`);
    if (parent.requiresSuperAdminContext) {
      assert.ok(item.requiresSuperAdminContext, `${item.href}: ungated child under a super-admin-only parent`);
    }
  }
});

test('admin rail: role gates are unchanged per destination', () => {
  const gated = new Set(ADMIN_PORTAL_NAV_ITEMS.filter((item) => item.requiresSuperAdminContext).map((item) => item.href));
  for (const href of ['/admin/messages', '/admin/settings', '/admin/users', '/admin/coursera', '/admin/metrics', '/admin/sessions', '/admin/pipeline', '/admin/members/duplicates', '/admin/feedback', '/admin/email-templates', '/admin/what-workforceap-does', '/admin/health', '/admin/agent-inbox', '/admin/csp-report']) {
    assert.ok(gated.has(href), `${href} must stay super-admin only`);
  }
  for (const href of ['/admin', '/admin/students', '/admin/programs', '/admin/training-progress', '/admin/invites', '/admin/blog', '/admin/analytics', '/admin/outcomes', '/admin/board', '/admin/placements', '/admin/jobs', '/admin/subgroups', '/admin/reporting', '/admin/command-center?queue=applications', '/admin/wioa-screening', '/admin/certifications', '/admin/program-change-requests']) {
    assert.ok(!gated.has(href), `${href} must stay open to org admins`);
  }
  assert.equal(gated.size, 26, 'the 26 super-admin gates from the flat rail carry over exactly');
});

test('admin rail: every guided-tour anchor sits on a top-level row, and every section but Daily work starts closed', () => {
  for (const item of ADMIN_PORTAL_NAV_ITEMS) {
    if (item.tourTarget) assert.ok(!item.parentHref, `${item.href}: tour anchor must be top-level`);
  }
  const adminSections = [...new Set(ADMIN_PORTAL_NAV_ITEMS.map((item) => item.group))];
  assert.deepEqual(adminSections, ['dailyWork', 'runTheOrg', 'programs', 'partnersEmployers', 'reporting', 'content', 'system']);
  for (const group of adminSections) {
    assert.equal(Boolean(NAV_GROUP_COLLAPSED_BY_DEFAULT[group]), group !== 'dailyWork', `${group} default state`);
  }
  for (const item of ADMIN_PORTAL_NAV_ITEMS.filter((entry) => entry.group === 'system')) {
    assert.ok(item.requiresSuperAdminContext, `${item.href}: Security & system is super-admin only`);
  }
});
