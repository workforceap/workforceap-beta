import { redirectTargetMatches } from './portal-audit-actions.mjs';
import { waitForPortalReady, waitForRedirectTargetCommit } from './portal-audit-browser.mjs';
import { trackSameOriginDataRequests } from './portal-audit-data-requests.mjs';

/** Await the final redirect and its data before starting another inventory navigation. */
export async function navigateMemberInventoryRoute(page, path, {
  trustedOrigin, expectedPath = path, dynamicPatterns = /** @type {string[]} */ ([]), timeout = 60_000,
}) {
  const data = trackSameOriginDataRequests(page, { trustedOrigin, dynamicPatterns });
  let documentStatus = null;
  const responseListener = response => {
    if (response.request().resourceType() === 'document' && response.frame() === page.mainFrame()) documentStatus = response.status();
  };
  page.on('response', responseListener);
  try {
    try {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded', timeout });
      if (response && response.status() >= 400) throw new Error(`Inventory document returned HTTP ${response.status()}.`);
    } catch (error) {
      if (path === expectedPath || !/net::ERR_ABORTED|interrupted by another navigation/.test(error?.message ?? '') || page.isClosed()) throw error;
    }
    await waitForRedirectTargetCommit(page, url => redirectTargetMatches(String(url), expectedPath, trustedOrigin), timeout);
    await waitForPortalReady(page, timeout);
    // The mentor gate leaves the member shell; its previous heading is not readiness evidence.
    if (new URL(expectedPath, trustedOrigin).pathname === '/mentor/apply') {
      await page.getByRole('heading', { level: 1, name: 'Mentor with WorkforceAP' }).waitFor({ state: 'visible', timeout });
    } else await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout });
    await data.waitForSettlement(5_000);
    if (documentStatus === null || documentStatus >= 400) throw new Error('The final inventory document did not load successfully.');
    if (data.errors.length) throw new Error(`Inventory data did not settle successfully: ${data.errors.join('; ')}`);
  } finally {
    page.off('response', responseListener);
    data.detach();
  }
}

const arrayField = name => value => value && Array.isArray(value[name]);
const queueResponse = value => value && Array.isArray(value.members) && value.counts &&
  Number.isSafeInteger(value.total) && value.total >= 0 &&
  ['all', 'high', 'medium', 'low', 'watch'].every(key => Number.isSafeInteger(value.counts[key]) && value.counts[key] >= 0) &&
  (value.nextCursor === null || (typeof value.nextCursor === 'string' && value.nextCursor.length > 0));

export function staffReadinessRequirements(path) {
  const pathname = new URL(path, 'https://fixture.invalid').pathname;
  if (pathname === '/partner/attention') return [
    { id: 'attention queue', path: '/api/partner/members/needs-attention', valid: queueResponse },
    { id: 'recent outreach', path: '/api/partner/outreach', valid: arrayField('logs') },
    { id: 'member choices', path: '/api/partner/referral-members', valid: arrayField('members') },
    { id: 'team owners', path: '/api/partner/team-assign', valid: arrayField('users') },
  ];
  const memberId = pathname.match(/^\/(?:counselor\/students|admin\/members)\/([a-zA-Z0-9_-]+)$/)?.[1];
  return memberId ? [{
    id: 'member resume', path: `/api/counselor/members/${memberId}/resume`,
    valid: value => value && typeof value.hasOriginal === 'boolean' && typeof value.hasEnhanced === 'boolean',
  }] : [];
}

/** Call before goto: a fast cached response must not race registration of the readiness probe. */
export function beginStaffDataReadiness(page, path, trustedOrigin, timeout = 30_000) {
  const requirements = staffReadinessRequirements(path);
  // Convert each rejection immediately so an earlier navigation error cannot leave an unhandled promise.
  const responses = Promise.all(requirements.map(async requirement => {
    try {
      const response = await page.waitForResponse(candidate => {
        const url = new URL(candidate.url());
        return candidate.request().method() === 'GET' && url.origin === trustedOrigin && url.pathname === requirement.path;
      }, { timeout });
      if (response.status() !== 200 || !requirement.valid(await response.json())) return `${requirement.id} response was not healthy`;
      return null;
    } catch { return `${requirement.id} response did not complete`; }
  }));
  return async () => {
    const failures = (await responses).filter(Boolean);
    if (failures.length) throw new Error(`Staff content is not ready: ${failures.join('; ')}.`);
    if (!requirements.length) return;
    await page.waitForFunction(() => ![...document.querySelectorAll('p')].some(element =>
      /^Loading(?: resume| preview)?…$/.test(element.textContent?.trim() ?? '')), undefined, { timeout });
    if (new URL(path, trustedOrigin).pathname === '/partner/attention') {
      await page.waitForFunction(() => {
        const refresh = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Refresh queue');
        return refresh && !refresh.disabled;
      }, undefined, { timeout });
    }
    if (await page.getByRole('alert').filter({ hasText: /could not load|no access|unavailable/i }).count()) {
      throw new Error('Staff content rendered a data-load error.');
    }
  };
}
