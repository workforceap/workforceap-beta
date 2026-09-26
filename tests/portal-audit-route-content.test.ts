import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasPortalRouteContent,
  inspectPortalPage,
  observeAdminDashboardMetrics,
  waitForPortalRouteContent,
} from '../scripts/lib/portal-audit-browser.mjs';

function shellWithLoadingRoute() {
  document.body.innerHTML = `
    <main id="main-content">
      <button type="button">Open navigation</button>
      <div class="portal-route-loading" aria-busy="true">Loading route</div>
    </main>
  `;
  document.body.innerText = 'WorkforceAP member portal Loading route Open navigation';
}

function pageWithLiveDom() {
  return {
    evaluate: async (evaluate: () => unknown) => evaluate(),
    waitForFunction: async (predicate: () => boolean, _arg: unknown, { timeout }: { timeout: number }) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error('route content timeout');
    },
  };
}

describe('portal audit streamed route readiness', () => {
  beforeEach(() => {
    shellWithLoadingRoute();
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not treat shell controls as route readiness while the skeleton is visible', async () => {
    const page = pageWithLiveDom();
    expect(hasPortalRouteContent()).toBe(false);
    expect((await inspectPortalPage(page)).appReady).toBe(false);
    await expect(waitForPortalRouteContent(page, 30)).rejects.toThrow('route content timeout');
  });

  it('waits for the skeleton to disappear and the route heading to appear', async () => {
    const page = pageWithLiveDom();
    setTimeout(() => {
      document.querySelector('.portal-route-loading')?.remove();
      document.querySelector('main')?.insertAdjacentHTML('beforeend', '<h1>Eligibility details</h1>');
    }, 15);
    await expect(waitForPortalRouteContent(page, 1_000)).resolves.toBeUndefined();
    expect(hasPortalRouteContent()).toBe(true);
    expect((await inspectPortalPage(page)).appReady).toBe(true);
  });

  it('ignores a hidden stale skeleton after the route heading is visible', () => {
    const loader = document.querySelector<HTMLElement>('.portal-route-loading');
    if (!loader) throw new Error('missing fixture loader');
    loader.style.display = 'none';
    document.querySelector('main')?.insertAdjacentHTML('beforeend', '<h1>Eligibility details</h1>');
    expect(hasPortalRouteContent()).toBe(true);
  });
});

describe('admin dashboard audit data readiness', () => {
  const response = (url: string, method = 'GET', status = 200) => ({
    url: () => url,
    request: () => ({ method: () => method }),
    status: () => status,
  });

  it('registers before navigation and accepts only the trusted metrics GET before loading clears', async () => {
    let deliverResponse: (value: ReturnType<typeof response>) => void = () => {};
    let currentUrl = 'https://preview.test/admin/dashboard';
    const responseGate = new Promise<ReturnType<typeof response>>((resolve) => { deliverResponse = resolve; });
    const waitFor = vi.fn(async () => {});
    const waitForResponse = vi.fn((matches: (value: ReturnType<typeof response>) => boolean) => {
      expect(matches(response('https://preview.test/api/admin/metrics'))).toBe(true);
      expect(matches(response('https://preview.test/api/admin/metrics?source=audit'))).toBe(true);
      expect(matches(response('https://elsewhere.test/api/admin/metrics'))).toBe(false);
      expect(matches(response('https://preview.test/api/admin/health'))).toBe(false);
      expect(matches(response('https://preview.test/api/admin/metrics', 'POST'))).toBe(false);
      expect(matches(response('invalid-url'))).toBe(false);
      currentUrl = 'https://preview.test/admin/reporting';
      expect(matches(response('https://preview.test/api/admin/metrics'))).toBe(false);
      currentUrl = 'https://preview.test/admin/dashboard';
      return responseGate;
    });
    const locator = vi.fn(() => ({ waitFor }));
    const page = { waitForResponse, locator, url: () => currentUrl };

    const check = observeAdminDashboardMetrics(page, 'https://preview.test', 1_000, 250);
    expect(waitForResponse).toHaveBeenCalledTimes(1);
    deliverResponse(response('https://preview.test/api/admin/metrics'));

    await expect(check).resolves.toBeNull();
    expect(locator).toHaveBeenCalledWith('[data-portal-loading-state="admin-metrics"]');
    expect(locator).toHaveBeenCalledWith('main#main-content [data-portal-data-ready="admin-metrics"]');
    expect(waitFor.mock.calls).toEqual([
      [{ state: 'hidden', timeout: 250 }],
      [{ state: 'visible', timeout: 250 }],
    ]);
  });

  it('fails when the API response is missing, non-200, or leaves loading visible', async () => {
    const loadingWait = vi.fn(async () => {});
    const page = (result: Promise<ReturnType<typeof response>>) => ({
      waitForResponse: vi.fn(() => result),
      locator: vi.fn(() => ({ waitFor: loadingWait })),
      url: () => 'https://preview.test/admin/dashboard',
    });

    const missing = page(Promise.reject(new Error('timeout with private request details')));
    await expect(observeAdminDashboardMetrics(missing, 'https://preview.test', 10, 10))
      .resolves.toBe('admin_metrics_api_response_missing');
    expect(missing.locator).not.toHaveBeenCalled();

    const failed = page(Promise.resolve(response('https://preview.test/api/admin/metrics', 'GET', 500)));
    await expect(observeAdminDashboardMetrics(failed, 'https://preview.test', 10, 10))
      .resolves.toBe('admin_metrics_api_http_error');
    expect(failed.locator).not.toHaveBeenCalled();

    loadingWait.mockRejectedValueOnce(new Error('loading with private page details'));
    const stuck = page(Promise.resolve(response('https://preview.test/api/admin/metrics')));
    await expect(observeAdminDashboardMetrics(stuck, 'https://preview.test', 10, 10))
      .resolves.toBe('admin_metrics_loading_not_cleared');

    loadingWait.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('private page details'));
    const empty = page(Promise.resolve(response('https://preview.test/api/admin/metrics')));
    await expect(observeAdminDashboardMetrics(empty, 'https://preview.test', 10, 10))
      .resolves.toBe('admin_metrics_content_not_ready');
  });
});
