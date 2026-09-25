/**
 * Runs before page scripts in a trusted Preview audit. Playwright serializes
 * this function into the browser, so it must not reference module scope.
 * Retain only pathnames, element tag names, counts and fixed shell-class
 * predicates. The caller rebuilds an allowlisted payload before logging;
 * portal text, arbitrary attributes, cookies and HTML never enter the trace.
 */
export function installPortalHydrationTrace() {
  const trace = {
    initialPathname: location.pathname,
    first: [],
    recent: [],
    atError: null,
  };
  let lastShape = '';

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
      portalTouchFirst: mainChildren[0]?.classList.contains('portal-touch-target') === true,
      shellCount: document.querySelectorAll('.workspace-shell-root').length,
      shellTags: shellChildren.slice(0, 8).map((element) => element.tagName.toLowerCase()),
      shellChildCount: shellChildren.length,
    };
  }

  function record(phase) {
    const shape = snapshot();
    const signature = JSON.stringify(shape);
    if (signature === lastShape && phase === 'mutation') return;
    lastShape = signature;
    const sample = { phase, ...shape };
    if (trace.first.length < 4) trace.first.push(sample);
    trace.recent.push(sample);
    if (trace.recent.length > 16) trace.recent.shift();
    return sample;
  }

  record('init');
  const observer = new MutationObserver((records) => {
    if (records.some(({ target }) =>
      target === document || target === document.documentElement ||
      target === document.body || target?.id === 'main-content' ||
      target?.classList?.contains('workspace-shell-root'))) {
      record('mutation');
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => record('domcontentloaded'), { once: true });
  window.addEventListener('error', (event) => {
    const message = String(event?.message ?? event?.error?.message ?? '');
    if (!/Minified React error #418|Hydration failed/i.test(message)) return;
    trace.atError = record('react-error');
    trace.errorPathname = location.pathname;
    observer.disconnect();
  }, true);
  window.__waPortalHydrationTrace = trace;
}
