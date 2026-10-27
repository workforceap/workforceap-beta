const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalFixtureGtmBootstrap, isLocalFixtureHmrSocket, localFixtureVercelBootstrap } = require('./lib/portal-local-network.mjs');
test('local analytics suppression is exact and cannot admit another resource or payload', () => {
  const url = 'https://www.googletagmanager.com/gtm.js?id=GTM-53JCT6WN';
  assert.equal(isLocalFixtureGtmBootstrap('GET', url), true);
  for (const value of [url.replace('https:', 'http:'), url.replace('.com/', '.com.evil/'), url.replace('gtm.js', 'collect'), `${url}&email=private`, `${url}&id=GTM-OTHER`, url.replace('53JCT6WN', 'OTHER'), 'invalid']) assert.equal(isLocalFixtureGtmBootstrap('GET', value), false);
  assert.equal(isLocalFixtureGtmBootstrap('POST', url), false);
});
test('local Vercel development suppression rejects every near miss and keeps separate rule IDs', () => {
  for (const [url, rule] of [
    ['https://va.vercel-scripts.com/v1/script.debug.js', 'vercelAnalyticsBootstrap'],
    ['https://va.vercel-scripts.com/v1/speed-insights/script.debug.js', 'vercelSpeedInsightsBootstrap'],
  ]) {
    assert.equal(localFixtureVercelBootstrap('GET', url), rule);
    for (const method of ['POST', 'HEAD', 'OPTIONS', 'get']) assert.equal(localFixtureVercelBootstrap(method, url), null);
    for (const variant of [url.replace('https:', 'http:'), url.replace('.com/', '.com.evil/'), url.replace('va.', 'other.'), url.replace('/v1/', '/v2/'), url.replace('script.debug.js', 'script.js'), `${url}?`, `${url}?payload=private`, `${url}#fragment`, `${url}/`, url.replace('https://', 'https://user@'), url.replace('/v1/', '/%76%31/')]) assert.equal(localFixtureVercelBootstrap('GET', variant), null);
  }
});
test('local HMR suppression never admits a provider, other websocket or another port', () => {
  assert.equal(isLocalFixtureHmrSocket('ws://127.0.0.1:3107/_next/webpack-hmr'), true);
  for (const value of ['wss://127.0.0.1:3107/_next/webpack-hmr', 'ws://127.0.0.1:3108/_next/webpack-hmr', 'ws://127.0.0.1:3107/api/realtime', 'wss://provider.invalid/_next/webpack-hmr']) assert.equal(isLocalFixtureHmrSocket(value), false);
});
