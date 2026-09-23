import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

test('program search hidden cards override the flex card layout', () => {
  const programs = source('marketing/src/pages/programs.astro');
  const cardRule = programs.indexOf('.pcard{');
  const hiddenRule = programs.indexOf('.pcard[hidden]');

  assert.ok(cardRule >= 0, 'program card layout rule is missing');
  assert.ok(hiddenRule > cardRule, 'hidden-card override must follow the flex card rule');
  assert.match(programs, /\.pcard\[hidden\]\s*\{\s*display\s*:\s*none\s*\}/);
});

test('program comparison pick-to-compare matrix is in the Astro page', () => {
  const page = source('marketing/src/pages/program-comparison.astro');

  assert.match(page, /data-compare-slug/);
  assert.match(page, /id="compare-matrix"/);
  assert.match(page, /id="sidebyside-heading"/);
  assert.match(page, /MIN_PICK = 2/);
  assert.match(page, /MAX_PICK = 4/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<h2>Need a hand choosing\?<\/h2>/);
  assert.match(page, /<h3 id="sidebyside-heading">Side-by-side comparison<\/h3>/);
  assert.match(page, /btn--sm/);
  assert.doesNotMatch(page, /<h4[\s>]/);
});

test('both pathfinders link to the real comparison page without unsupported selection copy', () => {
  const marketingPathfinder = source('marketing/src/components/FindYourPathQuiz.tsx');
  const appPathfinder = source('app/(decision-journey)/find-your-path/FindYourPathClient.tsx');

  assert.match(marketingPathfinder, /<a href="\/program-comparison">Compare programs<\/a>/);
  assert.match(
    appPathfinder,
    /<LocalizedLink href="\/program-comparison">Compare programs<\/LocalizedLink>/,
  );
  assert.doesNotMatch(marketingPathfinder, /check up to four tracks/i);
  assert.doesNotMatch(appPathfinder, /check up to four tracks/i);
});

test('closed mobile navigation backdrop is hidden from assistive technology', () => {
  const mainNav = source('components/MainNav.tsx');
  const backdropStart = mainNav.indexOf('className={`mobile-nav-backdrop');
  const backdrop = mainNav.slice(backdropStart, backdropStart + 600);

  assert.ok(backdropStart >= 0, 'mobile navigation backdrop is missing');
  assert.match(backdrop, /aria-hidden=\{!mobileOpen\}/);
  assert.match(backdrop, /tabIndex=\{mobileOpen \? 0 : -1\}/);
});

test('MainNav Programs lists Compare and Salary beside the pathfinder', () => {
  const mainNav = source('components/MainNav.tsx');
  const programsBlock = mainNav.slice(
    mainNav.indexOf("label: 'Programs'"),
    mainNav.indexOf("{ href: '/partners'"),
  );

  assert.match(programsBlock, /href: '\/find-your-path'/);
  assert.match(programsBlock, /href: '\/career-quiz'/);
  assert.match(programsBlock, /href: '\/program-comparison'/);
  assert.match(programsBlock, /href: '\/salary-guide'/);
  assert.match(mainNav, /href: '\/apply',\s*label: 'Membership'/);
});

test('decision journey and marketing mobile chrome use the canonical pathfinder', () => {
  const decisionNav = source('components/ProgramsDecisionJourneyNav.tsx');
  const mobileNav = source('components/MobileBottomNav.tsx');
  const programsPage = source('marketing/src/pages/programs.astro');

  assert.match(decisionNav, /href: '\/find-your-path'/);
  assert.doesNotMatch(
    decisionNav.slice(decisionNav.indexOf('const steps'), decisionNav.indexOf('return (')),
    /href: '\/career-quiz'/,
  );
  assert.match(mobileNav, /href: '\/find-your-path',\s*labelKey: 'marketing\.path'/);
  assert.match(programsPage, /href="\/find-your-path">Find Your Path/);
});

test('admin mobile bottom tabs: Today / Students, then Messages for super-admins and Applications for org admins', () => {
  const mobileNav = source('components/MobileBottomNav.tsx');
  const superBlock = mobileNav.slice(
    mobileNav.indexOf('const ADMIN_SUPER_TABS'),
    mobileNav.indexOf('const ADMIN_ORG_TABS'),
  );
  const orgBlock = mobileNav.slice(
    mobileNav.indexOf('const ADMIN_ORG_TABS'),
    mobileNav.indexOf('interface MobileBottomNavProps'),
  );

  for (const block of [superBlock, orgBlock]) {
    assert.match(block, /href: '\/admin'/);
    assert.match(block, /href: '\/admin\/students'/);
    assert.doesNotMatch(block, /\/admin\/members'/);
  }
  assert.match(superBlock, /href: '\/admin\/messages'/);
  assert.doesNotMatch(superBlock, /command-center/);
  // /admin/messages redirects non-super-admins back to /admin (WAP-190): org admins get the decision workbench instead.
  assert.doesNotMatch(orgBlock, /\/admin\/messages/);
  assert.match(orgBlock, /href: '\/admin\/command-center\?queue=applications'/);
});

test('counselor mobile bottom tabs lead with Today, then Inbox, members and messages', () => {
  const mobileNav = source('components/MobileBottomNav.tsx');
  const counselorBlock = mobileNav.slice(
    mobileNav.indexOf('const COUNSELOR_TABS'),
    mobileNav.indexOf('const PARTNER_TABS'),
  );

  // `/counselor` redirects to Today (counselor audit 2026-09-20 §6.1); the first tab is the landing page.
  assert.match(counselorBlock, /href: '\/counselor\/today', labelKey: 'counselor.today'/);
  assert.doesNotMatch(counselorBlock, /href: '\/counselor'[,}]/);
  assert.match(counselorBlock, /href: '\/counselor\/inbox'/);
  assert.match(counselorBlock, /href: '\/counselor\/students'/);
  assert.match(counselorBlock, /href: '\/counselor\/messages'/);
  assert.doesNotMatch(counselorBlock, /\/counselor\/resources'/);
});

test('MainNav desktop dropdowns sync open state on hover', () => {
  const mainNav = source('components/MainNav.tsx');
  assert.match(mainNav, /onMouseEnter=\{\(\) => \{ if \(window\.innerWidth > 900\) setActiveDropdown\(item\.label\); \}\}/);
  assert.match(mainNav, /onMouseEnter=\{\(\) => \{\s*if \(window\.innerWidth > 900 && loginSubmenuItems\.length > 0\) setActiveDropdown\('__login__'\);/);
});

test('member mobile top nav prefers Profile over a duplicate AI Advisor tab', () => {
  const topNav = source('components/portal/MemberPortalTopNav.tsx');
  assert.match(topNav, /canonical: '\/dashboard\/profile'/);
  assert.doesNotMatch(topNav, /canonical: '\/dashboard\/counselor'/);
});

test('member mobile top nav surfaces Jobs and Training progress before toolkit', () => {
  const topNav = source('components/portal/MemberPortalTopNav.tsx');
  const jobs = topNav.indexOf("canonical: '/dashboard/jobs'");
  const progress = topNav.indexOf("canonical: '/dashboard/readiness'");
  const messages = topNav.indexOf("canonical: '/dashboard/messages'");
  const toolkit = topNav.indexOf("canonical: '/dashboard/ai-tools'");
  const profile = topNav.indexOf("canonical: '/dashboard/profile'");

  assert.ok(jobs >= 0, 'Job board tab is missing');
  assert.ok(progress >= 0, 'Training progress tab is missing');
  assert.ok(jobs < progress && progress < messages && messages < toolkit && toolkit < profile);
});

test('localized signup opens root legal documents without Next prefetch requests', () => {
  const signup = source('app/(auth)/signup/SignupForm.tsx');
  const consentBlock = signup.slice(signup.indexOf('{/* Consent checkboxes */}'), signup.indexOf('{/* Error banner */}'));

  assert.match(consentBlock, /<a href="\/terms" target="_blank" rel="noopener noreferrer"/);
  assert.match(consentBlock, /<a href="\/privacy" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(consentBlock, /<LocalizedLink href="\/(?:terms|privacy)"/);
});
