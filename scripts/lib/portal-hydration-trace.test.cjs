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
  const main = element('MAIN', {
    id: 'main-content',
    parentElement: body,
    children: [mainChild],
    textContent: 'PRIVATE_MEMBER_RESUME',
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
      disconnect() { this.disconnected = true; }
    };

    installPortalHydrationTrace();
    assert.deepEqual(observer.options, { childList: true, subtree: true });
    assert.equal(window.__waPortalHydrationTrace.initialPathname, '/employer/messages');
    body.children.push(main);
    observer.callback([{ target: body }]);
    assert.deepEqual(window.__waPortalHydrationTrace.recent.at(-1).shellTags, ['script', 'span', 'header']);
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
