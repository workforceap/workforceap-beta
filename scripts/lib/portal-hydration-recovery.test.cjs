const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { JSDOM } = require('jsdom');

function tree(pageTag, childTag, label) {
  const page = React.createElement(pageTag, { className: 'portal-page-frame PRIVATE_MEMBER_CLASS' },
    React.createElement(childTag, { id: 'PRIVATE_MEMBER_ID' }, label));
  const shell = React.createElement('div', { className: 'workspace-shell-root' },
    React.createElement('div', { className: 'workspace-shell-main-body' }, page));
  return React.createElement('html', null,
    React.createElement('head', null),
    React.createElement('body', null,
      React.createElement('span', { hidden: true }, 'audit'),
      React.createElement('main', { id: 'main-content' },
        React.createElement('div', { className: 'portal-touch-target' }, shell))));
}

test('a React recovery retains a sanitized candidate of the detached original page', async () => {
  const { installPortalHydrationTrace } = await import('./portal-hydration-trace.mjs');
  const { sanitizePortalHydrationTrace } = await import('./portal-hydration-log.mjs');
  const secret = 'PRIVATE_MEMBER_RESUME_TOKEN';
  const dom = new JSDOM(`<!doctype html>${renderToString(tree('section', 'p', secret))}`, {
    url: `https://example.invalid/dashboard?token=${secret}`,
    pretendToBeVisual: true,
  });
  let root;

  try {
    for (const [key, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      location: dom.window.location,
      MutationObserver: dom.window.MutationObserver,
    })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });

    installPortalHydrationTrace();
    const { hydrateRoot } = require('react-dom/client');
    let recoverable = 0;
    root = hydrateRoot(document, tree('article', 'h2', 'different client text'), {
      onRecoverableError(error) {
        assert.match(error.message, /Hydration failed/);
        recoverable++;
        window.dispatchEvent(new window.ErrorEvent('error', { message: error.message }));
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const trace = window.__waPortalHydrationTrace;
    assert.equal(recoverable, 1);
    assert.equal(trace.firstObservedPage.boundary, 'workspace-main-body');
    assert.equal(trace.firstObservedPage.children[0].tag, 'section');
    assert.equal(trace.detachedMainPageCandidate.boundary, 'workspace-main-body');
    assert.equal(trace.detachedMainPageCandidate.children[0].tag, 'section');
    assert.equal(trace.detachedMainPageCandidate.children[0].marker, 'portal-page-frame');
    assert.equal(trace.detachedMainPageCandidate.children[0].children[0].tag, 'p');
    assert.equal(trace.atErrorPage.children[0].tag, 'article');

    const safe = sanitizePortalHydrationTrace(trace, {
      role: 'member', viewport: 'desktop', artifactPath: '/dashboard',
    });
    assert.equal(safe.detachedMainPageCandidate.children[0].tag, 'section');
    assert.equal(safe.atErrorPage.children[0].tag, 'article');
    assert.doesNotMatch(JSON.stringify(trace), /PRIVATE_MEMBER_RESUME_TOKEN|PRIVATE_MEMBER_CLASS|PRIVATE_MEMBER_ID/);
    assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_MEMBER_RESUME_TOKEN|PRIVATE_MEMBER_CLASS|PRIVATE_MEMBER_ID/);
  } finally {
    root?.unmount();
    dom.window.close();
    // Node's test runner isolates this file in its own process. Keep the
    // closed window global until React's scheduled cleanup has drained.
  }
});
