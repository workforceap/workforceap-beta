/**
 * Cross-portal smoke under one distinct account per selected role.
 * Remote targets must be either the exact trusted preview origin or an
 * allowlisted WorkforceAP production origin.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  PRODUCTION_CANARY_PATHS,
  PRODUCTION_CANARY_ROLES,
  ROLE_ACCESS_MATRIX,
  SECTION_LOGIN_REDIRECT,
  STATIC_PATHS,
} from '../../scripts/lib/portal-audit-paths.mjs';
import { classifyReadOnlyAuditRequest } from '../../scripts/lib/portal-audit-actions.mjs';
import {
  resolvePortalRoleCredentials,
  validateDedicatedPortalCredentials,
} from '../../scripts/lib/portal-audit-auth.mjs';
import { canonicalPathname } from '../../scripts/lib/portal-audit-classify.mjs';
import { waitForPortalReady } from '../../scripts/lib/portal-audit-browser.mjs';
import { validatePortalAuditTarget } from '../../scripts/lib/portal-audit-target.mjs';
import { installReadOnlyAuditCookie } from '../../scripts/lib/portal-audit-cookie.mjs';

const sectionArg = (process.env.PORTAL_AUDIT_SECTION ?? 'all').toLowerCase();
const rawBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim() || 'http://localhost:3000';
const requestedMode =
  process.env.PORTAL_AUDIT_MODE?.trim().toLowerCase() ||
  (rawBaseURL.startsWith('http://localhost:') || rawBaseURL.startsWith('http://127.0.0.1:')
    ? 'local'
    : '');
const readOnlyAuditToken = process.env.PORTAL_AUDIT_READ_ONLY_TOKEN?.trim() ?? '';

type Section = keyof typeof STATIC_PATHS;
type Credential = { email: string; password: string; source: string };

function sectionsToRun(): Section[] {
  const keys = Object.keys(STATIC_PATHS) as Section[];
  if (requestedMode === 'production_canary') {
    if (sectionArg !== 'all') {
      throw new Error('Production canary uses its fixed non-staff role matrix');
    }
    return [...PRODUCTION_CANARY_ROLES] as Section[];
  }
  if (requestedMode === 'isolated_preview' && sectionArg !== 'all') {
    throw new Error('Trusted preview audits must run the complete five-role matrix');
  }
  if (sectionArg === 'all') return keys;
  if (keys.includes(sectionArg as Section)) return [sectionArg as Section];
  throw new Error(`Unknown PORTAL_AUDIT_SECTION: ${sectionArg}`);
}

function routeURL(origin: string, path: string): string {
  return new URL(path, `${origin}/`).toString();
}

function isInsideRole(url: string, role: Section): boolean {
  const pathname = canonicalPathname(url);
  const root = SECTION_LOGIN_REDIRECT[role];
  return pathname === root || pathname.startsWith(`${root}/`);
}

async function goAllowingAbort(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('net::ERR_ABORTED')) throw error;
  }
  await waitForPortalReady(page, 5_000);
}

async function loginRole(
  page: Page,
  role: Section,
  credential: Credential,
  origin: string,
): Promise<string> {
  const entry = SECTION_LOGIN_REDIRECT[role];
  await goAllowingAbort(page, routeURL(origin, `/login?redirectTo=${encodeURIComponent(entry)}`));
  await page.getByRole('button', { name: /decline/i }).click().catch(() => {});
  await page.locator('#email').fill(credential.email);
  await page.locator('#password').fill(credential.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login([?#]|$)/, { timeout: 45_000 });

  if (!isInsideRole(page.url(), role)) {
    await goAllowingAbort(page, routeURL(origin, entry));
  }
  expect(isInsideRole(page.url(), role), `${role} login must land inside ${entry}`).toBe(true);

  const response = await page.request.get(routeURL(origin, '/api/member/profile'), {
    failOnStatusCode: false,
  });
  expect(response.ok(), `${role} identity endpoint must succeed`).toBe(true);
  const body = await response.json();
  expect(body?.user?.id, `${role} identity endpoint must return a stable user id`).toEqual(
    expect.any(String),
  );
  return body.user.id as string;
}

const sections = sectionsToRun();
const anyCredentialsConfigured = sections.some((role) => {
  const prefix = `E2E_${role.toUpperCase()}`;
  return Boolean(process.env[`${prefix}_EMAIL`] || process.env[`${prefix}_PASSWORD`]);
});

test.describe('cross-portal static routes and role isolation', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ serviceWorkers: 'block' });
  test.skip(!anyCredentialsConfigured, 'Dedicated portal E2E credentials are not configured');
  test.skip(readOnlyAuditToken.length < 32, 'Read-only audit capability is not configured');

  let trustedOrigin = '';
  let credentials: Record<string, Credential> = {};
  const authenticatedIdentityOwners = new Map<string, Section>();

  test.beforeAll(() => {
    const target = validatePortalAuditTarget({
      baseURL: rawBaseURL,
      mode: requestedMode,
      trustedPreviewOrigin: process.env.PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN,
    });
    expect(target.errors, 'Browser target must pass the exact-origin trust gate').toEqual([]);
    trustedOrigin = target.origin as string;

    const validation = validateDedicatedPortalCredentials(sections, process.env);
    expect(validation.errors, 'Every selected role must have a distinct configured identity').toEqual([]);
    credentials = validation.credentials as Record<string, Credential>;
  });

  test.afterAll(() => {
    expect(authenticatedIdentityOwners.size).toBe(sections.length);
  });

  for (const section of sections) {
    test(`${section} account sees only the allowed portal roots`, async ({ page }) => {
      let blockedWriteRequestCount = 0;
      let allowAuthentication = true;
      await installReadOnlyAuditCookie(page.context(), trustedOrigin, readOnlyAuditToken);
      await page.route('**/*', async (route) => {
        const request = route.request();
        const disposition = classifyReadOnlyAuditRequest(
          request.method(),
          request.url(),
          trustedOrigin,
          { allowAuthentication },
        );
        if (disposition === 'continue') {
          await route.continue();
          return;
        }
        if (disposition === 'suppress_telemetry') {
          await route.fulfill({ status: 204, body: '' });
          return;
        }
        blockedWriteRequestCount += 1;
        await route.abort('blockedbyclient');
      });

      const identityId = await loginRole(page, section, credentials[section], trustedOrigin);
      allowAuthentication = false;
      const previousOwner = authenticatedIdentityOwners.get(identityId);
      expect(
        previousOwner,
        `Authenticated ${section} account reused the same server identity as ${previousOwner}`,
      ).toBeUndefined();
      authenticatedIdentityOwners.set(identityId, section);

      const policy = ROLE_ACCESS_MATRIX[section];
      for (const targetRole of policy.allowed as Section[]) {
        await goAllowingAbort(page, routeURL(trustedOrigin, SECTION_LOGIN_REDIRECT[targetRole]));
        expect(
          isInsideRole(page.url(), targetRole),
          `${section} should be allowed inside the ${targetRole} portal`,
        ).toBe(true);
      }
      for (const targetRole of policy.denied as Section[]) {
        await goAllowingAbort(page, routeURL(trustedOrigin, SECTION_LOGIN_REDIRECT[targetRole]));
        expect(
          isInsideRole(page.url(), targetRole),
          `${section} must be denied from the ${targetRole} portal`,
        ).toBe(false);
      }

      const paths = requestedMode === 'production_canary'
        ? PRODUCTION_CANARY_PATHS[section as keyof typeof PRODUCTION_CANARY_PATHS]
        : STATIC_PATHS[section];
      for (const path of paths) {
        await goAllowingAbort(page, routeURL(trustedOrigin, path));
        expect(
          isInsideRole(page.url(), section),
          `${section} route ${path} redirected outside ${SECTION_LOGIN_REDIRECT[section]}: ${canonicalPathname(page.url())}`,
        ).toBe(true);
      }
      expect(blockedWriteRequestCount, 'Read-only browser pass attempted a non-login write').toBe(0);
    });
  }
});
