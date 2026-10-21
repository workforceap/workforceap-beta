/** Complete canonical routes and real alias destinations; missing fixtures fail explicitly. */
import { test, expect, type Page, type Response } from '@playwright/test';
import { DEV_MEMBER_VIEWS, DEV_MEMBER_ALIASES } from '../../app/dev/member/harness/registry';
import { getCareerBriefs } from '../../lib/content/careerBriefs';
import {
  DIGITAL_LITERACY_FIRST_COURSE_SLUG,
  DIGITAL_LITERACY_PROGRAM_SLUG,
} from '../../shared/digitalLiteracyPathway';
import { loginPortalRole, hasPortalRoleCredentials } from './auth-helpers';
import { resolveMemberPortalCredentials } from '../../scripts/lib/portal-audit-auth.mjs';
import {
  assertDeploymentAcceptedReadOnlyAudit,
  assertReadOnlyAuditCookieInstalled,
  installReadOnlyAuditCookie,
} from '../../scripts/lib/portal-audit-cookie.mjs';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
const overrides: Record<string, string> = JSON.parse(process.env.PORTAL_C_MEMBER_ROUTE_FIXTURES ?? '{}');
const parents: Record<string, string> = {
  'job-detail': '/dashboard/jobs', 'learning-module': '/dashboard/program', lab: '/dashboard/program',
  'counselor-detail': '/dashboard/counselor', 'mentor-profile': '/dashboard/mentors',
  'career-brief-detail': '/dashboard/career-brief', 'career-library-detail': '/dashboard/career-library',
};
const catalogs: Record<string, string> = {
  'learning-module': `/dashboard/learning/modules/${DIGITAL_LITERACY_FIRST_COURSE_SLUG}?program=${DIGITAL_LITERACY_PROGRAM_SLUG}`,
  lab: '/dashboard/learning/labs/ticket-triage',
  'career-brief-detail': `/dashboard/career-brief/${getCareerBriefs()[0]?.slug ?? ''}`,
};

function fixturePathname(href: string) {
  return new URL(href, 'https://fixture.invalid').pathname;
}

function matchesFixture(href: string, pattern: string) {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  let pathname: string;
  try {
    pathname = fixturePathname(href);
  } catch {
    return false;
  }
  const parts = pathname.split('/');
  const expected = pattern.split('/');
  return parts.length === expected.length && parts.every((part, i) => expected[i].startsWith('[')
    ? /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(part)
    : part === expected[i]);
}

async function gotoInventory(page: Page, path: string): Promise<Response | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(path, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|interrupted/i.test(message) || attempt === 2) throw error;
    }
  }
  throw lastError;
}

async function concretePath(page: Page, slug: string, pattern: string) {
  if (!pattern.includes('[')) return pattern;
  const supplied = overrides[slug];
  if (supplied) {
    if (!matchesFixture(supplied, pattern)) throw new Error(`Invalid synthetic fixture path for ${slug}`);
    return supplied;
  }
  const parent = parents[slug];
  if (!parent) throw new Error(`Missing fixture resolver for ${slug}`);
  await gotoInventory(page, parent);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(/^Loading(?: resume)?…$/)).toHaveCount(0, { timeout: 30_000 });
  const links = await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => a.getAttribute('href') ?? ''));
  const found = links.find(href => matchesFixture(href, pattern));
  if (found) return found;
  const catalog = catalogs[slug];
  if (catalog && matchesFixture(catalog, pattern)) return catalog;
  throw new Error(`No authorized synthetic fixture for ${slug}; provide PORTAL_C_MEMBER_ROUTE_FIXTURES or seed a reversible DEMO fixture.`);
}

test.describe('member routes — authenticated inventory', () => {
  test.beforeEach(() => {
    if (process.env.PORTAL_C_REQUIRED === '1' && !hasPortalRoleCredentials('member')) throw new Error('Dedicated member credentials are required.');
    test.skip(!hasPortalRoleCredentials('member'), 'Dedicated member credentials are unavailable.');
  });
  for (const width of [1440, 390]) {
    test(`member inventory, mentor access gate, and aliases at ${width}`, async ({ page, baseURL }) => {
      test.setTimeout(900_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      if (resolveMemberPortalCredentials(process.env).email.toLowerCase() !== 'member-test@workforceap.org') throw new Error('Dedicated synthetic member credentials are required.');
      const auditToken = process.env.PORTAL_AUDIT_READ_ONLY_TOKEN ?? '';
      if (auditToken.length < 32) throw new Error('Read-only audit capability is required for the inventory sweep.');
      const trustedOrigin = new URL(baseURL ?? '').origin;
      await installReadOnlyAuditCookie(page.context(), trustedOrigin, auditToken);
      await assertReadOnlyAuditCookieInstalled(page.context(), trustedOrigin);
      await loginPortalRole(page, 'member');
      await installReadOnlyAuditCookie(page.context(), trustedOrigin, auditToken);
      await assertReadOnlyAuditCookieInstalled(page.context(), trustedOrigin);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await assertDeploymentAcceptedReadOnlyAudit(page);
      await expect(page.locator('[data-portal-audit-suppressed="workspace-nav-badges-and-notification-polling"]')).toHaveCount(1);
      await page.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
      const failures: string[] = [];
      for (const view of DEV_MEMBER_VIEWS) {
        try {
          const path = await concretePath(page, view.slug, view.livePath);
          const response = await gotoInventory(page, path);
          expect(response?.status(), view.slug).toBeLessThan(400);
          await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
          // This inventory entry serves mentors, not ordinary members. Prove the
          // member access gate here; mentor content requires its own staff fixture.
          const expectedPath = view.slug === 'mentor' ? '/mentor/apply' : fixturePathname(path);
          expect(new URL(page.url()).pathname.replace(/^\/(en|es|fr|pt)(?=\/)/, '')).toBe(expectedPath);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          await expect(page.locator('[data-portal-error-state]')).toHaveCount(0);
        } catch (error) { failures.push(`${view.slug}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      for (const alias of DEV_MEMBER_ALIASES) {
        const expected = new URL(alias.path === '/pwa-start' ? '/dashboard' : alias.path.endsWith('/readiness-coach') ? '/dashboard/ai-tools?tab=session&agent=readiness' : alias.target, 'https://fixture.invalid');
        await gotoInventory(page, alias.path);
        await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
        const final = new URL(page.url());
        expect(final.pathname.replace(/^\/(en|es|fr|pt)(?=\/)/, '')).toBe(expected.pathname);
        for (const [key, value] of expected.searchParams) expect(final.searchParams.get(key)).toBe(value);
        if (expected.hash) expect(final.hash).toBe(expected.hash);
      }
      const unknown = await gotoInventory(page, '/dashboard/portal-c-route-does-not-exist');
      expect(unknown?.status(), 'The dashboard catch-all must preserve notFound').toBe(404);
      expect(failures, `Missing or failing authenticated views: ${failures.join(', ')}`).toEqual([]);
    });
  }
});
