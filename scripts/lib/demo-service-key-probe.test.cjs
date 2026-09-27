/** MOCKED/offline: a fake fetch only; no network. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { DEMO_ORIGIN, PROBE_PATH, probeDemoServiceKey } = require('./demo-service-key-probe.cjs');
const { DEMO_REF, PROD_REF } = require('./supabase-project-guard.cjs');

const KEY = 'sb_secret_SYNTHETICKEYVALUE0123456789';
const BODY_SENTINEL = 'USER-DATA-SENTINEL resume-qa-7-1@example.com';

function fakeFetch(outcome) {
  const calls = [];
  let bodyRead = false;
  let cancelled = false;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (outcome instanceof Error) throw outcome;
    const readBody = async () => { bodyRead = true; return BODY_SENTINEL; };
    return {
      status: outcome,
      text: readBody,
      json: readBody,
      body: { cancel: async () => { cancelled = true; } },
    };
  };
  return { fetchImpl, calls, bodyRead: () => bodyRead, cancelled: () => cancelled };
}

function assertClean(result) {
  const text = JSON.stringify(result);
  for (const secret of [KEY, BODY_SENTINEL, DEMO_REF, PROD_REF, 'supabase.co']) {
    assert.ok(!text.includes(secret), `result leaks ${secret}`);
  }
}

test('[mock] DEMO origin plus key: exactly one bounded GET to the hardcoded DEMO origin, body discarded unread', async () => {
  for (const [status, key] of [[200, 'valid'], [401, 'rejected'], [403, 'rejected'], [500, 'unavailable'], [503, 'unavailable'], [302, 'unavailable'], [404, 'unavailable']]) {
    const fake = fakeFetch(status);
    const result = await probeDemoServiceKey({ url: `${DEMO_ORIGIN}/`, key: KEY, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { urlProject: 'demo', key }, String(status));
    assert.equal(fake.calls.length, 1);
    const [{ url, init }] = fake.calls;
    assert.equal(url, `${DEMO_ORIGIN}${PROBE_PATH}`);
    assert.equal(url, `https://${DEMO_REF}.supabase.co/auth/v1/admin/users?page=1&per_page=1`);
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(init.headers, { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: 'application/json' });
    assert.equal(fake.bodyRead(), false, 'body never read');
    assert.equal(fake.cancelled(), true, 'body discarded');
    assertClean(result);
  }
});

test('[mock] a network error or timeout is unavailable, with no error text surfaced', async () => {
  for (const error of [new TypeError(`fetch failed ${KEY}`), Object.assign(new Error(`timeout ${KEY}`), { name: 'TimeoutError' })]) {
    const fake = fakeFetch(error);
    const result = await probeDemoServiceKey({ url: DEMO_ORIGIN, key: KEY, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { urlProject: 'demo', key: 'unavailable' });
    assert.equal(fake.calls.length, 1);
    assertClean(result);
  }
});

test('[mock] a real timeout aborts the one request and reports unavailable', async () => {
  const calls = [];
  const hanging = (url, init) => new Promise((_, reject) => {
    calls.push(url);
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  // AbortSignal.timeout does not hold the event loop open; this timer does.
  const keepAlive = setTimeout(() => {}, 5_000);
  const result = await probeDemoServiceKey({ url: DEMO_ORIGIN, key: KEY, fetchImpl: hanging, timeoutMs: 20 });
  clearTimeout(keepAlive);
  assert.deepEqual(result, { urlProject: 'demo', key: 'unavailable' });
  assert.equal(calls.length, 1);
});

test('[mock] anything but the exact DEMO origin, or an unusable key, makes zero network calls', async () => {
  const urls = [
    [`https://${PROD_REF}.supabase.co`, 'prod'],
    [`http://${DEMO_REF}.supabase.co`, 'unknown'],
    [`https://${DEMO_REF}.supabase.co/rest/v1`, 'demo-noncanonical'],
    [`https://${DEMO_REF}.supabase.co?x=1`, 'demo-noncanonical'],
    [`https://user:pw@${DEMO_REF}.supabase.co`, 'demo-noncanonical'],
    [`https://${DEMO_REF}.supabase.co.evil.test`, 'unknown'],
    ['not a url', 'unknown'],
    ['', 'unset'],
    [undefined, 'unset'],
  ];
  for (const [url, urlProject] of urls) {
    const fake = fakeFetch(200);
    const result = await probeDemoServiceKey({ url, key: KEY, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { urlProject, key: 'not-checked' }, String(url));
    assert.equal(fake.calls.length, 0, String(url));
    assertClean(result);
  }
  for (const [key, label] of [['', 'missing'], [undefined, 'missing'], [`${KEY}\r\n`, 'invalid'], [`${KEY} `, 'invalid'], ['kéy', 'invalid']]) {
    const fake = fakeFetch(200);
    assert.deepEqual(await probeDemoServiceKey({ url: DEMO_ORIGIN, key, fetchImpl: fake.fetchImpl }), { urlProject: 'demo', key: label });
    assert.equal(fake.calls.length, 0);
  }
});

test('[mock] the CLI reads only its two fixed names and prints fixed labels', async () => {
  const { run } = await import('../check-preview-service-key.mjs');
  const names = ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'];
  const ok = fakeFetch(200);
  const pass = await run(names, { PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, ok.fetchImpl);
  assert.deepEqual(pass, { ok: true, line: '{"urlProject":"demo","key":"valid"}' });
  const rejected = fakeFetch(401);
  const fail = await run(names, { PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, rejected.fetchImpl);
  assert.deepEqual(fail, { ok: false, line: '{"urlProject":"demo","key":"rejected"}' });
  const prod = fakeFetch(200);
  const refused = await run(names, { PREVIEW_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, prod.fetchImpl);
  assert.deepEqual(refused, { ok: false, line: '{"urlProject":"prod","key":"not-checked"}' });
  assert.equal(prod.calls.length, 0);
  for (const argv of [[], ['PREVIEW_SUPABASE_URL'], [...names].reverse(), [...names, 'HOME'], ['HOME', 'PATH']]) {
    const bad = fakeFetch(200);
    const result = await run(argv, { HOME: KEY, PATH: KEY, PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, bad.fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(bad.calls.length, 0);
    assert.ok(!result.line.includes(KEY));
  }
});
