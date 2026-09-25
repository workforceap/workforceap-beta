import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasPortalRouteContent,
  inspectPortalPage,
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
