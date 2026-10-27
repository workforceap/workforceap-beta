import { redirectTargetMatches } from './portal-audit-actions.mjs';
import { waitForPortalReady, waitForRedirectTargetCommit } from './portal-audit-browser.mjs';
import { trackSameOriginDataRequests } from './portal-audit-data-requests.mjs';

/** Await the final redirect and its data before starting another inventory navigation. */
export async function navigateMemberInventoryRoute(page, path, {
  trustedOrigin, expectedPath = path, dynamicPatterns = /** @type {string[]} */ ([]), timeout = 60_000,
}) {
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Inventory readiness requires a positive finite timeout.');
  if ([path, expectedPath].some(value => new URL(value, trustedOrigin).origin !== trustedOrigin)) throw new Error('Inventory route must remain on its trusted origin.');
  const data = trackSameOriginDataRequests(page, { trustedOrigin, dynamicPatterns });
  const consoleListener = message => data.recordConsoleError(message);
  page.on('console', consoleListener);
  let pageErrorCount = 0;
  const pageErrorListener = () => { pageErrorCount += 1; };
  page.on('pageerror', pageErrorListener);
  let documentStatus = null;
  const responseListener = response => {
    if (response.request().resourceType() === 'document' && response.frame() === page.mainFrame() && redirectTargetMatches(response.url(), expectedPath, trustedOrigin)) documentStatus = response.status();
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
    // Next can stream its notFound() UI after successful document headers.
    // The application fallback has no data-portal-error-state marker.
    if (await page.getByRole('heading', { level: 1, name: /^(?:Page not found|404)$/i }).count()) {
      throw new Error('The inventory route rendered a not-found page.');
    }
    if (documentStatus === null || documentStatus >= 400) throw new Error('The final inventory document did not load successfully.');
    if (data.errors.length) throw new Error(`Inventory data did not settle successfully: ${data.errors.join('; ')}`);
    if (pageErrorCount || data.consoleErrors.length || data.pendingDataRequestCount) throw new Error('Inventory runtime, console or pending data errors prevent readiness.');
  } finally {
    page.off('response', responseListener);
    page.off('console', consoleListener);
    page.off('pageerror', pageErrorListener);
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
  if (!requirements.length) return Object.assign(async () => {}, { dispose() {} });
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Staff readiness requires a positive finite timeout.');
  const deadline = Date.now() + timeout;
  const pending = new Map();
  const seen = new Set();
  const responses = Promise.all(requirements.map(requirement => new Promise(resolve => {
    pending.set(requirement.path, { ...requirement, resolve });
  })));
  let stopped = null;
  let disposed = false;
  let timer;
  let resolveStopped;
  // Resolve with an error value: disposal before ready() must not reject an orphan promise.
  const stoppedResult = new Promise(resolve => { resolveStopped = resolve; });
  const cleanup = () => {
    disposed = true;
    clearTimeout(timer);
    page.off('response', onResponse);
    page.off('close', onClose);
  };
  const finish = (responsePath, failure) => {
    const requirement = pending.get(responsePath);
    if (!requirement) return; // Ignore late body completion after timeout/disposal.
    pending.delete(responsePath);
    requirement.resolve(failure);
    if (!pending.size) page.off('response', onResponse);
  };
  const stop = (reason) => {
    if (disposed) return;
    const failures = [...pending.values()].map(requirement => `${requirement.id} response did not complete`);
    stopped = new Error(`Staff content is not ready: ${failures.length ? failures.join('; ') : reason}.`);
    resolveStopped(stopped);
    for (const [responsePath, requirement] of pending) finish(responsePath, `${requirement.id} response did not complete`);
    cleanup();
  };
  const onClose = () => stop('page closed before readiness completed');
  const onResponse = response => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    const requirement = pending.get(url.pathname);
    if (!requirement || seen.has(url.pathname) || url.origin !== trustedOrigin || response.request().method() !== 'GET') return;
    seen.add(url.pathname);
    // A response event only proves headers arrived. The same deadline must also
    // cover json(), and both late resolution and rejection must remain observed.
    Promise.resolve().then(async () => response.status() === 200 && requirement.valid(await response.json())
      ? null : `${requirement.id} response was not healthy`)
      .then(failure => finish(url.pathname, failure), () => finish(url.pathname, `${requirement.id} response did not complete`));
  };
  page.on('response', onResponse);
  page.on('close', onClose);
  timer = setTimeout(() => stop('rendering did not complete before the readiness deadline'), timeout);
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error('Staff content is not ready: readiness deadline expired.');
    return value;
  };
  const inspect = async () => {
    if (stopped) throw stopped;
    const failures = (await responses).filter(Boolean);
    if (failures.length) throw new Error(`Staff content is not ready: ${failures.join('; ')}.`);
    await page.waitForFunction(() => ![...document.querySelectorAll('p')].some(element =>
      /^Loading(?: resume| preview)?…$/.test(element.textContent?.trim() ?? '')), undefined, { timeout: remaining() });
    if (new URL(path, trustedOrigin).pathname === '/partner/attention') {
      await page.waitForFunction(() => {
        const refresh = [...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Refresh queue');
        return refresh && !refresh.disabled;
      }, undefined, { timeout: remaining() });
    }
    if (await page.getByRole('alert').filter({ hasText: /could not load|no access|unavailable/i }).count()) {
      throw new Error('Staff content rendered a data-load error.');
    }
  };
  let readiness;
  const ready = () => readiness ??= Promise.race([
    inspect().then(() => null, error => error), stoppedResult,
  ]).then(error => { if (error) throw error; }).finally(cleanup);
  return Object.assign(ready, { dispose: () => stop('readiness was disposed before completion') });
}
