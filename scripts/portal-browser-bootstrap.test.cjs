const test = require('node:test');
const assert = require('node:assert/strict');
const { assertBrowserBootstrap } = require('./lib/portal-browser-bootstrap.mjs');
const { readinessConsoleCategory } = require('./lib/portal-c-browser-readiness.mjs');
test('one-time bootstrap failures remain fatal before any per-case baseline', () => {
  assertBrowserBootstrap({ blocked: 0, pageErrors: 0, consoleErrors: 0 });
  for (const key of ['blocked', 'pageErrors', 'consoleErrors']) for (const value of [1, -1, undefined]) assert.throws(() => assertBrowserBootstrap({ blocked: 0, pageErrors: 0, consoleErrors: 0, [key]: value }));
});
test('readiness diagnostics retain a bounded category without raw console content', () => {
  assert.equal(readinessConsoleCategory(['Failed to load resource: net::ERR_ABORTED']), 'console_resource_aborted');
  assert.equal(readinessConsoleCategory(['Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector']), 'console_resource_blocked');
  assert.equal(readinessConsoleCategory(['private content and token']), 'console_other');
});
