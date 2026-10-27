import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalFixtureGtmBootstrap, isLocalFixtureHmrSocket } from './lib/portal-local-network.mjs';
test('local analytics suppression is exact and cannot admit another resource or payload', () => {
  const url = 'https://www.googletagmanager.com/gtm.js?id=GTM-53JCT6WN';
  assert.equal(isLocalFixtureGtmBootstrap('GET', url), true);
  for (const value of [url.replace('https:', 'http:'), url.replace('.com/', '.com.evil/'), url.replace('gtm.js', 'collect'), `${url}&email=private`, `${url}&id=GTM-OTHER`, url.replace('53JCT6WN', 'OTHER'), 'invalid']) assert.equal(isLocalFixtureGtmBootstrap('GET', value), false);
  assert.equal(isLocalFixtureGtmBootstrap('POST', url), false);
});
test('local HMR suppression never admits a provider, other websocket or another port', () => {
  assert.equal(isLocalFixtureHmrSocket('ws://127.0.0.1:3107/_next/webpack-hmr'), true);
  for (const value of ['wss://127.0.0.1:3107/_next/webpack-hmr', 'ws://127.0.0.1:3108/_next/webpack-hmr', 'ws://127.0.0.1:3107/api/realtime', 'wss://provider.invalid/_next/webpack-hmr']) assert.equal(isLocalFixtureHmrSocket(value), false);
});
