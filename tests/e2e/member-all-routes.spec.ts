/** Complete canonical routes and real alias destinations; missing fixtures fail explicitly. */
import { test, expect, type Page } from '@playwright/test';
import { DEV_MEMBER_VIEWS, DEV_MEMBER_ALIASES } from '../../app/dev/member/harness/registry';
import { getPracticeLab } from '../../lib/content/itSupportLabs';
import { loginPortalRole, hasPortalRoleCredentials } from './auth-helpers';
import { resolveMemberPortalCredentials } from '../../scripts/lib/portal-audit-auth.mjs';
import { MEMBER_ROUTE_PARENTS, memberRouteFixturePath, parseMemberRouteFixtures } from '../../scripts/lib/portal-c-member-routes.mjs';
import { navigateMemberInventoryRoute } from '../../scripts/lib/portal-c-browser-readiness.mjs';
import {
  assertDeploymentAcceptedReadOnlyAudit,
  assertReadOnlyAuditCookieInstalled,
  installReadOnlyAuditCookie,
} from '../../scripts/lib/portal-audit-cookie.mjs';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
const overrides = parseMemberRouteFixtures(process.env.PORTAL_C_MEMBER_ROUTE_FIXTURES, DEV_MEMBER_VIEWS);
const staticPaths = DEV_MEMBER_VIEWS.filter(view => !view.livePath.includes('[')).map(view => view.livePath);
const dynamicPatterns = DEV_MEMBER_VIEWS.filter(view => view.livePath.includes('[')).map(view => view.livePath);

async function concretePath(page: Page, slug: string, pattern: string, trustedOrigin: string) {
  if (!pattern.includes('[')) return pattern;
  const supplied = overrides[slug];
  if (supplied) return supplied;
  const parent = MEMBER_ROUTE_PARENTS[slug as keyof typeof MEMBER_ROUTE_PARENTS];
  if (!parent) throw new Error(`Missing fixture resolver for ${slug}`);
  await navigateMemberInventoryRoute(page, parent, { trustedOrigin, dynamicPatterns });
  let found: string | null = null;
  await expect.poll(async () => {
    const links = await page.locator('a[href]:visible').evaluateAll(anchors => anchors.map(a => a.getAttribute('href') ?? ''));
    found = links.map(href => memberRouteFixturePath(href, pattern, staticPaths)).find(Boolean) ?? null;
    return found;
  }, { timeout: 15_000, message: `No authorized fixture for ${slug}; supply existing scoped records through PORTAL_C_MEMBER_ROUTE_FIXTURES.` }).not.toBeNull();
  return found;
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
          const path = await concretePath(page, view.slug, view.livePath, trustedOrigin);
          if (!path) throw new Error(`No authorized fixture for ${view.slug}.`);
          // This inventory entry serves mentors, not ordinary members. Prove the
          // member access gate here; mentor content requires its own staff fixture.
          const expectedPath = view.slug === 'mentor' ? '/mentor/apply' : path;
          await navigateMemberInventoryRoute(page, path, { trustedOrigin, expectedPath, dynamicPatterns });
          await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          if (view.slug === 'lab') {
            const lab = getPracticeLab(new URL(path, trustedOrigin).pathname.split('/').at(-1) ?? '');
            if (!lab) throw new Error('The fixture does not name a published practice lab.');
            await expect(page.getByRole('heading', { level: 1, name: lab.title, exact: true })).toBeVisible();
          }
          await expect(page.locator('[data-portal-error-state]')).toHaveCount(0);
        } catch (error) { failures.push(`${view.slug}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      for (const alias of DEV_MEMBER_ALIASES) {
        const expected = new URL(alias.path === '/pwa-start' ? '/dashboard' : alias.path.endsWith('/readiness-coach') ? '/dashboard/ai-tools?tab=session&agent=readiness' : alias.target, 'https://fixture.invalid');
        await navigateMemberInventoryRoute(page, alias.path, { trustedOrigin, expectedPath: `${expected.pathname}${expected.search}${expected.hash}`, dynamicPatterns });
        await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/);
        const final = new URL(page.url());
        expect(final.pathname.replace(/^\/(en|es|fr|pt)(?=\/)/, '')).toBe(expected.pathname);
        for (const [key, value] of expected.searchParams) expect(final.searchParams.get(key)).toBe(value);
        if (expected.hash) expect(final.hash).toBe(expected.hash);
      }
      const unknown = await page.goto('/dashboard/portal-c-route-does-not-exist', { waitUntil: 'domcontentloaded' });
      expect(unknown?.status(), 'The dashboard catch-all must preserve notFound').toBe(404);
      expect(failures, `Missing or failing authenticated views: ${failures.join(', ')}`).toEqual([]);
    });
  }
});
