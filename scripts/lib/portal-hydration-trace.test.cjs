const assert = require('node:assert/strict');
const { test } = require('node:test');

test('hydration trace captures root structure without portal content or attributes', async () => {
  const { installPortalHydrationTrace } = await import('./portal-hydration-trace.mjs');
  const keys = ['document', 'window', 'location', 'MutationObserver'];
  const old = new Map(keys.map((key) => [key, {
    exists: Object.hasOwn(globalThis, key),
    value: globalThis[key],
  }]));
  const listeners = {};
  let observer;
  const element = (tagName, extra = {}) => ({ tagName, children: [], classList: { contains: () => false }, ...extra });
  const body = element('BODY');
  const shell = element('DIV', {
    classList: { contains: (name) => name === 'workspace-shell-root' },
    children: [element('SCRIPT'), element('SPAN'), element('HEADER')],
  });
  const mainChild = element('DIV', {
    textContent: 'PRIVATE_MEMBER_RESUME',
    className: 'PRIVATE_MEMBER_CLASS',
    classList: { contains: (name) => name === 'portal-touch-target' },
    children: [shell],
  });
  let loadingPresent = true;
  let headingPresent = false;
  const main = element('MAIN', {
    id: 'main-content',
    parentElement: body,
    children: [mainChild],
    textContent: 'PRIVATE_MEMBER_RESUME',
    querySelectorAll: (selector) => selector === '.portal-route-loading'
      ? loadingPresent ? [element('DIV')] : []
      : selector === 'h1' && headingPresent ? [element('H1')] : [],
  });

  try {
    globalThis.document = {
      body,
      documentElement: element('HTML'),
      getElementById: () => body.children.includes(main) ? main : null,
      querySelector: (selector) => selector === '.workspace-shell-root' && body.children.includes(main) ? shell : null,
      querySelectorAll: (selector) => body.children.includes(main) &&
        (selector === 'main#main-content' || selector === '.workspace-shell-root') ? [main] : [],
      addEventListener: (name, listener) => { listeners[name] = listener; },
    };
    globalThis.window = {
      addEventListener: (name, listener) => { listeners[name] = listener; },
    };
    globalThis.location = { pathname: '/employer/messages', search: '?token=PRIVATE_TOKEN' };
    globalThis.MutationObserver = class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe(target, options) { this.target = target; this.options = options; }
      takeRecords() { return []; }
      disconnect() { this.disconnected = true; }
    };

    installPortalHydrationTrace();
    assert.equal(window.__waPortalHydrationTrace.auditTraceVersion, 1);
    assert.deepEqual(observer.options, { childList: true, subtree: true });
    assert.equal(window.__waPortalHydrationTrace.initialPathname, '/employer/messages');
    body.children.push(main);
    observer.callback([{ target: body }]);
    assert.deepEqual(window.__waPortalHydrationTrace.recent.at(-1).shellTags, ['script', 'span', 'header']);
    assert.equal(window.__waPortalHydrationTrace.recent.at(-1).routeLoadingCount, 1);
    loadingPresent = false;
    headingPresent = true;
    observer.callback([{ target: main }]);
    assert.equal(window.__waPortalHydrationTrace.recent.at(-1).routeLoadingCount, 0);
    assert.equal(window.__waPortalHydrationTrace.recent.at(-1).routeHeadingCount, 1);
    assert.ok(window.__waPortalHydrationTrace.recent.at(-1).elapsedMs >= 0);
    shell.children.shift();
    observer.callback([{ target: shell }]);
    listeners.DOMContentLoaded();
    listeners.error({ message: 'Minified React error #418' });

    const trace = window.__waPortalHydrationTrace;
    assert.equal(trace.atError.mainCount, 1);
    assert.equal(trace.atError.mainBodyIndex, 0);
    assert.equal(trace.atError.portalTouchFirst, true);
    assert.equal(trace.atError.shellCount, 1);
    assert.deepEqual(trace.atError.shellTags, ['span', 'header']);
    assert.equal(trace.errorPathname, '/employer/messages');
    assert.equal(observer.disconnected, true);
    const serialized = JSON.stringify(trace);
    assert.doesNotMatch(serialized, /PRIVATE_MEMBER_RESUME|PRIVATE_MEMBER_CLASS|PRIVATE_TOKEN/);
  } finally {
    for (const [key, previous] of old) {
      if (previous.exists) globalThis[key] = previous.value;
      else delete globalThis[key];
    }
  }
});

test('hydration trace projects a removed main from an earlier observer callback', async () => {
  const { installPortalHydrationTrace } = await import('./portal-hydration-trace.mjs');
  const keys = ['document', 'window', 'location', 'MutationObserver'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = {};
  let observer;
  const page = {
    tagName: 'DIV', classList: { contains: (name) => name === 'workspace-shell-main-body' },
    children: [{ tagName: 'SECTION', classList: { contains: () => false }, children: [{ tagName: 'P', classList: { contains: () => false }, children: [] }] }],
  };
  const removedMain = {
    nodeType: 1, tagName: 'MAIN', matches: (selector) => selector === 'main#main-content',
    querySelector: (selector) => selector === '.workspace-shell-main-body' ? page : null,
  };

  try {
    globalThis.document = {
      body: { children: [] }, documentElement: {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      addEventListener: () => {},
    };
    globalThis.window = { addEventListener: (name, listener) => { listeners[name] = listener; } };
    globalThis.location = { pathname: '/dashboard' };
    globalThis.MutationObserver = class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      takeRecords() { return []; }
      disconnect() {}
    };

    installPortalHydrationTrace();
    observer.callback([{ target: document.body, removedNodes: [removedMain] }]);
    listeners.error({ message: 'Minified React error #418' });
    const candidate = window.__waPortalHydrationTrace.detachedMainPageCandidate;
    assert.equal(candidate.boundary, 'workspace-main-body');
    assert.deepEqual(candidate.children.map((child) => child.tag), ['section']);
    assert.deepEqual(candidate.children[0].children.map((child) => child.tag), ['p']);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
