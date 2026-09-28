/** MOCKED/offline: a fake fetch only; no network. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { DEMO_ORIGIN, PROBE_PATH, diagnoseDemoServiceKeyHeaders, keyFormatOf, probeDemoServiceKey } = require('./demo-service-key-probe.cjs');
const { DEMO_REF, PROD_REF } = require('./supabase-project-guard.cjs');

const KEY = 'sb_secret_SYNTHETICKEYVALUE0123456789';
// Synthetic three-segment JWT shape; not a real token and never decoded.
const LEGACY_KEY = 'eyJDQU5BUllIRUFERVI.eyJDQU5BUllQQVlMT0FE.Q0FOQVJZU0lHTkFUVVJF';
const BODY_SENTINEL = 'USER-DATA-SENTINEL resume-qa-7-1@example.com';

/** One outcome for every call, or an array with one outcome per call in order. */
function fakeFetch(outcome) {
  const calls = [];
  let bodyRead = false;
  let cancelled = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const current = Array.isArray(outcome) ? outcome[calls.length - 1] : outcome;
    if (current instanceof Error) throw current;
    const readBody = async () => { bodyRead = true; return BODY_SENTINEL; };
    return {
      status: current,
      text: readBody,
      json: readBody,
      headers: new Map([['x-echo', KEY]]),
      body: { cancel: async () => { cancelled += 1; } },
    };
  };
  return { fetchImpl, calls, bodyRead: () => bodyRead, cancelled: () => cancelled > 0, cancelCount: () => cancelled };
}

/** Every 8-character window of each canary key, so no fragment can leak either. */
function keyFragments() {
  const out = [];
  for (const key of [KEY, LEGACY_KEY]) {
    for (let i = 0; i + 8 <= key.length; i += 1) out.push(key.slice(i, i + 8));
  }
  return out;
}

function assertClean(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  for (const secret of [KEY, LEGACY_KEY, BODY_SENTINEL, DEMO_REF, PROD_REF, 'supabase.co', ...keyFragments()]) {
    assert.ok(!text.includes(secret), `result leaks ${secret}`);
  }
}

function headerNames(init) {
  return Object.keys(init.headers).map((name) => name.toLowerCase()).sort();
}

test('[mock] DEMO origin plus key: exactly one bounded GET to the hardcoded DEMO origin, body discarded unread', async () => {
  for (const [status, key] of [[200, 'valid'], [401, 'rejected'], [403, 'rejected'], [500, 'unavailable'], [503, 'unavailable'], [302, 'unavailable'], [404, 'unavailable']]) {
    const fake = fakeFetch(status);
    const result = await probeDemoServiceKey({ url: `${DEMO_ORIGIN}/`, key: KEY, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { urlProject: 'demo', key, keyFormat: 'modern-secret' }, String(status));
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
    assert.deepEqual(result, { urlProject: 'demo', key: 'unavailable', keyFormat: 'modern-secret' });
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
  assert.deepEqual(result, { urlProject: 'demo', key: 'unavailable', keyFormat: 'modern-secret' });
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
    assert.deepEqual(result, { urlProject, key: 'not-checked', keyFormat: 'modern-secret' }, String(url));
    assert.equal(fake.calls.length, 0, String(url));
    assertClean(result);
  }
  for (const [key, label] of [['', 'missing'], [undefined, 'missing'], [`${KEY}\r\n`, 'invalid'], [`${KEY} `, 'invalid'], ['kéy', 'invalid']]) {
    const fake = fakeFetch(200);
    assert.deepEqual(await probeDemoServiceKey({ url: DEMO_ORIGIN, key, fetchImpl: fake.fetchImpl }), { urlProject: 'demo', key: label, keyFormat: 'unknown' });
    assert.equal(fake.calls.length, 0);
  }
});

test('[mock] the CLI reads only its two fixed names and prints fixed labels', async () => {
  const { run } = await import('../check-preview-service-key.mjs');
  const names = ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'];
  const ok = fakeFetch(200);
  const pass = await run(names, { PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, ok.fetchImpl);
  assert.deepEqual(pass, { ok: true, line: '{"urlProject":"demo","key":"valid","keyFormat":"modern-secret","bothHeaders":"valid","apikeyOnly":"valid"}' });
  assert.equal(ok.calls.length, 2);
  const rejected = fakeFetch(401);
  const fail = await run(names, { PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, rejected.fetchImpl);
  assert.deepEqual(fail, { ok: false, line: '{"urlProject":"demo","key":"rejected","keyFormat":"modern-secret","bothHeaders":"rejected","apikeyOnly":"rejected"}' });
  const prod = fakeFetch(200);
  const refused = await run(names, { PREVIEW_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, prod.fetchImpl);
  assert.deepEqual(refused, { ok: false, line: '{"urlProject":"prod","key":"not-checked","keyFormat":"modern-secret","bothHeaders":"not-checked","apikeyOnly":"not-checked"}' });
  assert.equal(prod.calls.length, 0);
  for (const argv of [[], ['PREVIEW_SUPABASE_URL'], [...names].reverse(), [...names, 'HOME'], ['HOME', 'PATH']]) {
    const bad = fakeFetch(200);
    const result = await run(argv, { HOME: KEY, PATH: KEY, PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: KEY }, bad.fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(bad.calls.length, 0);
    assert.ok(!result.line.includes(KEY));
  }
});

test('[mock] keyFormat is a shape category only, never decoded or measured', () => {
  const cases = [
    [KEY, 'modern-secret'],
    ['sb_secret_x', 'modern-secret'],
    ['sb_secret_', 'unknown'],
    ['sb_publishable_SYNTHETICKEYVALUE0123456789', 'unknown'],
    ['SB_SECRET_SYNTHETIC', 'unknown'],
    [` ${KEY}`, 'unknown'],
    [`${KEY}\n`, 'unknown'],
    [LEGACY_KEY, 'legacy-jwt'],
    ['eyJa.eyJb.c', 'legacy-jwt'],
    ['eyJa.eyJb', 'unknown'],
    ['eyJa.eyJb.', 'unknown'],
    ['eyJa..c', 'unknown'],
    ['eyJa.eyJb.c.d', 'unknown'],
    ['abc.def.ghi', 'unknown'],
    ['eyJa.eyJ+b.c', 'unknown'],
    [`${LEGACY_KEY}\r\n`, 'unknown'],
    ['', 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
    [42, 'unknown'],
  ];
  for (const [key, format] of cases) assert.equal(keyFormatOf(key), format, JSON.stringify(key));
});

test('[mock] a legacy JWT key keeps the same both-header gate request', async () => {
  const fake = fakeFetch(200);
  const result = await probeDemoServiceKey({ url: DEMO_ORIGIN, key: LEGACY_KEY, fetchImpl: fake.fetchImpl });
  assert.deepEqual(result, { urlProject: 'demo', key: 'valid', keyFormat: 'legacy-jwt' });
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].init.headers, { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}`, Accept: 'application/json' });
  assertClean(result);
});

test('[mock] diagnosis: the both-header gate GET, then one apikey-only GET to the same hardcoded endpoint', async () => {
  const combos = [
    [[401, 200], 'rejected', 'valid'],
    [[403, 200], 'rejected', 'valid'],
    [[200, 200], 'valid', 'valid'],
    [[200, 401], 'valid', 'rejected'],
    [[401, 401], 'rejected', 'rejected'],
    [[401, 500], 'rejected', 'unavailable'],
    [[500, 200], 'unavailable', 'valid'],
    [[302, 302], 'unavailable', 'unavailable'],
    [[401, 307], 'rejected', 'unavailable'],
    [[301, 200], 'unavailable', 'valid'],
  ];
  for (const key of [KEY, LEGACY_KEY]) {
    for (const [statuses, bothHeaders, apikeyOnly] of combos) {
      const fake = fakeFetch(statuses);
      const result = await diagnoseDemoServiceKeyHeaders({ url: DEMO_ORIGIN, key, fetchImpl: fake.fetchImpl });
      const keyFormat = key === KEY ? 'modern-secret' : 'legacy-jwt';
      // The gate (`key`) is always the both-header result; apikey-only never lifts it.
      assert.deepEqual(result, { urlProject: 'demo', key: bothHeaders, keyFormat, bothHeaders, apikeyOnly }, String(statuses));
      assert.equal(fake.calls.length, 2);
      const [gate, diag] = fake.calls;
      for (const { url, init } of fake.calls) {
        assert.equal(url, `https://${DEMO_REF}.supabase.co/auth/v1/admin/users?page=1&per_page=1`);
        assert.equal(init.method, 'GET');
        assert.equal(init.redirect, 'manual');
        assert.ok(init.signal instanceof AbortSignal);
        assert.equal(init.body, undefined);
      }
      assert.deepEqual(headerNames(gate.init), ['accept', 'apikey', 'authorization']);
      assert.deepEqual(gate.init.headers, { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' });
      assert.deepEqual(headerNames(diag.init), ['accept', 'apikey']);
      assert.deepEqual(diag.init.headers, { apikey: key, Accept: 'application/json' });
      assert.equal(fake.bodyRead(), false, 'body never read');
      assert.equal(fake.cancelCount(), 2, 'both bodies discarded');
      assertClean(result);
    }
  }
});

test('[mock] diagnosis: a network error or real timeout is unavailable for each request', async () => {
  const errors = [new TypeError(`fetch failed ${KEY}`), Object.assign(new Error(`timeout ${KEY}`), { name: 'TimeoutError' })];
  for (const outcome of [[errors[0], errors[1]], [401, errors[0]], [errors[1], 200]]) {
    const fake = fakeFetch(outcome);
    const result = await diagnoseDemoServiceKeyHeaders({ url: DEMO_ORIGIN, key: KEY, fetchImpl: fake.fetchImpl });
    const label = (value) => (value instanceof Error ? 'unavailable' : value === 200 ? 'valid' : 'rejected');
    assert.deepEqual(result, {
      urlProject: 'demo', key: label(outcome[0]), keyFormat: 'modern-secret', bothHeaders: label(outcome[0]), apikeyOnly: label(outcome[1]),
    });
    assert.equal(fake.calls.length, 2);
    assertClean(result);
  }
  const calls = [];
  const hanging = (url, init) => new Promise((_, reject) => {
    calls.push(init.headers);
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const keepAlive = setTimeout(() => {}, 5_000);
  const result = await diagnoseDemoServiceKeyHeaders({ url: DEMO_ORIGIN, key: KEY, fetchImpl: hanging, timeoutMs: 20 });
  clearTimeout(keepAlive);
  assert.deepEqual(result, { urlProject: 'demo', key: 'unavailable', keyFormat: 'modern-secret', bothHeaders: 'unavailable', apikeyOnly: 'unavailable' });
  assert.equal(calls.length, 2);
});

test('[mock] diagnosis sends nothing when the gate request would not be sent', async () => {
  const cases = [
    [`https://${PROD_REF}.supabase.co`, KEY, 'prod', 'not-checked', 'modern-secret'],
    [`https://${DEMO_REF}.supabase.co/rest/v1`, LEGACY_KEY, 'demo-noncanonical', 'not-checked', 'legacy-jwt'],
    [DEMO_ORIGIN, '', 'demo', 'missing', 'unknown'],
    [DEMO_ORIGIN, undefined, 'demo', 'missing', 'unknown'],
    [DEMO_ORIGIN, `${KEY}\r\n`, 'demo', 'invalid', 'unknown'],
  ];
  for (const [url, key, urlProject, label, keyFormat] of cases) {
    const fake = fakeFetch(200);
    const result = await diagnoseDemoServiceKeyHeaders({ url, key, fetchImpl: fake.fetchImpl });
    assert.deepEqual(result, { urlProject, key: label, keyFormat, bothHeaders: 'not-checked', apikeyOnly: 'not-checked' });
    assert.equal(fake.calls.length, 0);
    assertClean(result);
  }
});

test('[mock] the CLI stays red on a both-header refusal and names the client-header fix, never the key', async () => {
  const { run, CLIENT_HEADERS_NOTE } = await import('../check-preview-service-key.mjs');
  const names = ['PREVIEW_SUPABASE_URL', 'PREVIEW_SUPABASE_SERVICE_ROLE_KEY'];
  const outputs = [];
  for (const key of [KEY, LEGACY_KEY]) {
    const keyFormat = key === KEY ? 'modern-secret' : 'legacy-jwt';
    const env = { PREVIEW_SUPABASE_URL: DEMO_ORIGIN, PREVIEW_SUPABASE_SERVICE_ROLE_KEY: key };
    const mismatch = await run(names, env, fakeFetch([401, 200]).fetchImpl);
    assert.deepEqual(mismatch, {
      ok: false,
      line: `{"urlProject":"demo","key":"rejected","keyFormat":"${keyFormat}","bothHeaders":"rejected","apikeyOnly":"valid"}`,
      note: CLIENT_HEADERS_NOTE,
    });
    const both = await run(names, env, fakeFetch([200, 200]).fetchImpl);
    assert.deepEqual(both, { ok: true, line: `{"urlProject":"demo","key":"valid","keyFormat":"${keyFormat}","bothHeaders":"valid","apikeyOnly":"valid"}` });
    const gateOnly = await run(names, env, fakeFetch([200, 401]).fetchImpl);
    assert.equal(gateOnly.ok, true, 'the gate is the both-header result');
    assert.equal(gateOnly.note, undefined);
    const neither = await run(names, env, fakeFetch([401, 401]).fetchImpl);
    assert.equal(neither.ok, false);
    assert.equal(neither.note, undefined);
    const down = await run(names, env, fakeFetch([new TypeError(`fetch failed ${key}`), 200]).fetchImpl);
    assert.equal(down.ok, false);
    assert.equal(down.note, undefined, 'only a rejected both-header result earns the note');
    const redirected = await run(names, env, fakeFetch([302, 302]).fetchImpl);
    assert.equal(redirected.ok, false);
    outputs.push(mismatch, both, gateOnly, neither, down, redirected);
  }
  for (const output of outputs) {
    assertClean(output.line);
    if (output.note) assertClean(output.note);
  }
});
