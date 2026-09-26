/**
 * Narrow authenticated portal hub smoke — member, counselor, employer.
 *
 * Login → hub → one deep link each. Soft-skips when that role's E2E_* pair is
 * missing so PR/CI without Supabase secrets stays green. Not part of ci-gate;
 * run against the isolated preview (or any deployed URL) via:
 *
 *   PLAYWRIGHT_BASE_URL=https://<trusted-preview-origin> \
 *   E2E_MEMBER_EMAIL=… E2E_MEMBER_PASSWORD=… \
 *   E2E_COUNSELOR_EMAIL=… E2E_COUNSELOR_PASSWORD=… \
 *   E2E_EMPLOYER_EMAIL=… E2E_EMPLOYER_PASSWORD=… \
 *   npm run test:e2e:portal-hubs
 *
 * Trusted Actions wiring: workflow_dispatch `hub_smoke` on
 * `.github/workflows/authenticated-portal-smoke.yml` (master only, WAP-66).
 */
import { test, expect, type Page } from '@playwright/test';
import {
  isPortalHubSmokePath,
  PORTAL_HUB_SMOKE_PATHS,
  PORTAL_HUB_SMOKE_ROLES,
} from '../../scripts/lib/portal-hub-smoke-paths.mjs';
import { hasPortalRoleCredentials, loginPortalRole } from './auth-helpers';

type HubSmokeRole = keyof typeof PORTAL_HUB_SMOKE_PATHS;

async function assertInsideRole(page: Page, role: HubSmokeRole): Promise<void> {
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 20_000 });
  const pathname = new URL(page.url()).pathname;
  expect(
    isPortalHubSmokePath(pathname, role),
    `${role} must stay under ${PORTAL_HUB_SMOKE_PATHS[role].hub} (got ${pathname})`,
  ).toBe(true);
}

function primaryPageHeading(page: Page, name: RegExp) {
  return page.getByRole('heading', { level: 1, name });
}

test('page headings remain visible when the shell has a hidden matching label', async ({ page }) => {
  const cases = [
    { title: 'Welcome back, Member', name: PORTAL_HUB_SMOKE_PATHS.member.hubHeading },
    { title: 'Job board', name: PORTAL_HUB_SMOKE_PATHS.member.deepHeading },
    { title: 'Today', name: PORTAL_HUB_SMOKE_PATHS.counselor.hubHeading },
    { title: 'Inbox zero', name: PORTAL_HUB_SMOKE_PATHS.counselor.deepHeading },
    { title: 'Hiring', name: PORTAL_HUB_SMOKE_PATHS.employer.hubHeading },
    { title: 'Applicants (0)', name: PORTAL_HUB_SMOKE_PATHS.employer.deepHeading },
  ];

  for (const { title, name } of cases) {
    await page.setContent(
      `<span class="workspace-shell-current-page" hidden>${title}</span><main><h1>${title}</h1></main>`,
    );
    await expect(page.getByText(title).first()).toBeHidden();
    await expect(primaryPageHeading(page, name)).toBeVisible();
  }
});

for (const role of PORTAL_HUB_SMOKE_ROLES as readonly HubSmokeRole[]) {
  const paths = PORTAL_HUB_SMOKE_PATHS[role];

  test.describe(`portal hub smoke: ${role}`, () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(180_000);

    test.beforeEach(() => {
      test.skip(
        !hasPortalRoleCredentials(role),
        `Set E2E_${role.toUpperCase()}_EMAIL and E2E_${role.toUpperCase()}_PASSWORD to run ${role} hub smoke`,
      );
    });

    test(`login → ${paths.hub} → ${paths.deepLink}`, async ({ page }) => {
      await loginPortalRole(page, role);
      await assertInsideRole(page, role);
      await expect(primaryPageHeading(page, paths.hubHeading)).toBeVisible({ timeout: 20_000 });

      await page.goto(paths.deepLink, { waitUntil: 'domcontentloaded' });
      await assertInsideRole(page, role);
      await expect(page).toHaveURL((url) => url.pathname === paths.deepLink, { timeout: 20_000 });
      await expect(primaryPageHeading(page, paths.deepHeading)).toBeVisible({ timeout: 20_000 });
    });
  });
}
