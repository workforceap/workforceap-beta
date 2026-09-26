/**
 * Runs before page scripts in a trusted Preview audit. Playwright serializes
 * this function into the browser, so it must not reference module scope.
 * Retain only pathnames, element tag names, counts and fixed shell-class
 * predicates. The caller rebuilds an allowlisted payload before logging;
 * portal text, arbitrary attributes, cookies and HTML never enter the trace.
 */
export function installPortalHydrationTrace() {
  const startedAt = performance.now();
  const trace = {
    auditTraceVersion: 1,
    initialPathname: location.pathname,
    first: [],
    recent: [],
    atError: null,
    firstObservedPage: null,
    detachedMainPageCandidate: null,
    atErrorPage: null,
  };
  let lastShape = '';
  let detachedMainPageCandidate = null;

  // These fixed classes identify layout chrome, never user-authored content.
  // Store only the matched enum; never store className or another attribute.
  const pageMarkers = [
    'portal-page-frame', 'portal-route-loading', 'wa-page-opener',
    'wa-kit-card', 'portal-breadcrumb',
  ];
  function nodeMarker(element) {
    return pageMarkers.find((marker) => element.classList?.contains(marker)) ?? 'other';
  }

  function pageStructure(root) {
    const workspace = root?.classList?.contains('workspace-shell-main-body')
      ? root : root?.querySelector?.('.workspace-shell-main-body');
    const portal = workspace ? null : (root?.classList?.contains('portal-touch-target')
      ? root : root?.querySelector?.('.portal-touch-target'));
    const boundary = workspace ?? portal;
    if (!boundary) return null;
    const children = Array.from(boundary.children);
    return {
      boundary: workspace ? 'workspace-main-body' : 'portal-touch-target',
      childCount: children.length,
      children: children.slice(0, 6).map((child) => {
        const grandchildren = Array.from(child.children);
        return {
          tag: child.tagName.toLowerCase(),
          marker: nodeMarker(child),
          childCount: grandchildren.length,
          children: grandchildren.slice(0, 6).map((grandchild) => ({
            tag: grandchild.tagName.toLowerCase(),
            marker: nodeMarker(grandchild),
          })),
        };
      }),
    };
  }

  function captureRemovedMain(records) {
    for (const record of records) {
      for (const node of record.removedNodes ?? []) {
        if (node.nodeType !== 1) continue;
        const main = node.matches?.('main#main-content')
          ? node : node.tagName === 'BODY' ? node.querySelector?.('main#main-content') : null;
        if (!main) continue;
        const candidate = pageStructure(main);
        if (candidate?.childCount) detachedMainPageCandidate = candidate;
      }
    }
  }

  function snapshot() {
    const body = document.body;
    const main = document.getElementById('main-content');
    const shell = document.querySelector('.workspace-shell-root');
    const bodyChildren = body ? Array.from(body.children) : [];
    const mainChildren = main ? Array.from(main.children) : [];
    const shellChildren = shell ? Array.from(shell.children) : [];
    return {
      bodyTags: bodyChildren.slice(0, 16).map((element) => element.tagName.toLowerCase()),
      bodyChildCount: bodyChildren.length,
      mainCount: document.querySelectorAll('main#main-content').length,
      mainBodyIndex: main && main.parentElement === body ? bodyChildren.indexOf(main) : -1,
      mainTags: mainChildren.slice(0, 8).map((element) => element.tagName.toLowerCase()),
      mainChildCount: mainChildren.length,
      routeLoadingCount: main?.querySelectorAll?.('.portal-route-loading').length ?? 0,
      routeHeadingCount: main?.querySelectorAll?.('h1').length ?? 0,
      portalTouchFirst: mainChildren[0]?.classList.contains('portal-touch-target') === true,
      shellCount: document.querySelectorAll('.workspace-shell-root').length,
      shellTags: shellChildren.slice(0, 8).map((element) => element.tagName.toLowerCase()),
      shellChildCount: shellChildren.length,
    };
  }

  function record(phase) {
    if (phase !== 'react-error' && !trace.firstObservedPage) {
      const page = pageStructure(document);
      if (page?.childCount) trace.firstObservedPage = page;
    }
    const shape = snapshot();
    const signature = JSON.stringify(shape);
    if (signature === lastShape && phase === 'mutation') return;
    lastShape = signature;
    const sample = { phase, elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)), ...shape };
    if (trace.first.length < 4) trace.first.push(sample);
    trace.recent.push(sample);
    if (trace.recent.length > 16) trace.recent.shift();
    return sample;
  }

  record('init');
  const observer = new MutationObserver((records) => {
    captureRemovedMain(records);
    if (records.some(({ target }) =>
      target === document || target === document.documentElement ||
      target === document.body || target?.id === 'main-content' ||
      target?.classList?.contains('workspace-shell-root') ||
      target?.classList?.contains('workspace-shell-main-body') ||
      target?.classList?.contains('portal-touch-target') ||
      target?.closest?.('.workspace-shell-main-body'))) {
      record('mutation');
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => record('domcontentloaded'), { once: true });
  window.addEventListener('error', (event) => {
    const message = String(event?.message ?? event?.error?.message ?? '');
    if (!/Minified React error #418|Hydration failed/i.test(message)) return;
    // React can replace the root before reporting the recoverable error. The
    // detached original <main> remains available in queued mutation records;
    // project it to bounded primitives before those records are discarded.
    captureRemovedMain(observer.takeRecords());
    trace.detachedMainPageCandidate = detachedMainPageCandidate;
    trace.atErrorPage = pageStructure(document);
    trace.atError = record('react-error');
    trace.errorPathname = location.pathname;
    observer.disconnect();
  }, true);
  window.__waPortalHydrationTrace = trace;
}
