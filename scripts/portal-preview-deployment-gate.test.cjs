const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/vercel-preview-deployment.json');
const gate = import('./lib/portal-preview-deployment-gate.mjs');
const sha = fixture.sha;

function harness(overrides = {}) {
  let clock = 0;
  const sleeps = [];
  return {
    sha,
    listDeployments: async () => [fixture],
    listStatuses: async () => [{ state: 'success' }],
    timeoutMs: 100,
    registrationTimeoutMs: 20,
    intervalMs: 7,
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    sleeps,
    ...overrides,
  };
}

test('real Vercel Preview metadata uses SHA as ref and an empty payload', async () => {
  const { selectPreviewDeployment, waitForPreviewDeployment } = await gate;
  assert.equal(fixture.ref, sha);
  assert.deepEqual(fixture.payload, {});
  assert.equal(selectPreviewDeployment([fixture], sha), fixture);
  assert.deepEqual(await waitForPreviewDeployment(harness()), { ok: true, deploymentId: fixture.id });
});

test('reject stale SHA, production, wrong creator and explicit other branch', async () => {
  const { selectPreviewDeployment } = await gate;
  for (const change of [
    { sha: 'a'.repeat(40) }, { environment: 'Production' },
    { production_environment: true }, { creator: { login: 'someone' } },
    { ref: 'feature/other' }, { id: '123' },
  ]) assert.equal(selectPreviewDeployment([{ ...fixture, ...change }], sha), null);
});

test('a newer pending deployment supersedes an old successful one', async () => {
  const { waitForPreviewDeployment } = await gate;
  const seen = [];
  const options = harness({
    listDeployments: async () => [fixture, { ...fixture, id: fixture.id + 1 }],
    listStatuses: async (id) => { seen.push(id); return [{ state: seen.length === 2 ? 'success' : 'pending' }]; },
  });
  assert.equal((await waitForPreviewDeployment(options)).ok, true);
  assert.deepEqual(seen, [fixture.id + 1, fixture.id + 1]);
  assert.deepEqual(options.sleeps, [7]);
});

for (const state of ['failure', 'error', 'inactive', 'cancelled', 'canceled']) {
  test(`${state} is terminal and cannot authorize login`, async () => {
    const { waitForPreviewDeployment } = await gate;
    const options = harness({ listStatuses: async () => [{ state }] });
    assert.deepEqual(await waitForPreviewDeployment(options), {
      ok: false, reason: 'deployment_failed', state, deploymentId: fixture.id,
    });
    assert.deepEqual(options.sleeps, []);
  });
}

test('missing deployment stops at registration deadline with actionable diagnostics', async () => {
  const { waitForPreviewDeployment, describePreviewFailure } = await gate;
  const options = harness({ listDeployments: async () => [] });
  const result = await waitForPreviewDeployment(options);
  assert.equal(result.reason, 'deployment_missing');
  assert.deepEqual(options.sleeps, [7, 7, 6]);
  assert.match(describePreviewFailure(result), /unchanged ref does not retry/);
  assert.match(describePreviewFailure(result), /No login attempted/);
});

test('registered pending build gets the full build window, not registration window', async () => {
  const { waitForPreviewDeployment } = await gate;
  const options = harness({ listStatuses: async () => [{ state: 'in_progress' }] });
  assert.equal((await waitForPreviewDeployment(options)).reason, 'build_timeout');
  assert.equal(options.sleeps.reduce((a, b) => a + b, 0), 100);
});

test('deployment registered after polling can finish successfully', async () => {
  const { waitForPreviewDeployment } = await gate;
  let calls = 0;
  const options = harness({ listDeployments: async () => ++calls < 3 ? [] : [fixture] });
  assert.equal((await waitForPreviewDeployment(options)).ok, true);
  assert.equal(calls, 3);
});

test('API failures and malformed responses never masquerade as missing deployment', async () => {
  const { waitForPreviewDeployment } = await gate;
  await assert.rejects(waitForPreviewDeployment(harness({ listDeployments: async () => { throw new Error('permission'); } })), /permission/);
  await assert.rejects(waitForPreviewDeployment(harness({ listDeployments: async () => ({}) })), /Invalid deployments/);
  await assert.rejects(waitForPreviewDeployment(harness({ listStatuses: async () => ({}) })), /Invalid deployment statuses/);
});

test('cancellation before or during an API read fails closed', async () => {
  const { waitForPreviewDeployment } = await gate;
  const controller = new AbortController();
  controller.abort();
  assert.equal((await waitForPreviewDeployment(harness({ signal: controller.signal }))).reason, 'cancelled');
  const during = new AbortController();
  assert.equal((await waitForPreviewDeployment(harness({ signal: during.signal,
    listStatuses: async () => { during.abort(); return [{ state: 'success' }]; },
  }))).reason, 'cancelled');
});

test('unknown states fail closed without logging untrusted metadata', async () => {
  const { waitForPreviewDeployment } = await gate;
  const logs = [];
  const outcome = await waitForPreviewDeployment(harness({
    listStatuses: async () => [{ state: 'secret-token\n::notice::bad', description: 'secret' }],
    log: (line) => logs.push(line),
  }));
  assert.equal(outcome.reason, 'unexpected_state');
  assert.doesNotMatch(logs.join(''), /secret|notice/);
});

test('invalid trusted SHA and polling windows fail closed', async () => {
  const { waitForPreviewDeployment } = await gate;
  await assert.rejects(waitForPreviewDeployment(harness({ sha: 'latest' })), /full trusted/);
  for (const value of [0, -1, Infinity, NaN]) {
    await assert.rejects(waitForPreviewDeployment(harness({ timeoutMs: value })), /polling window/);
  }
});


test('a late success response cannot pass the build deadline', async () => {
  const { waitForPreviewDeployment } = await gate;
  let clock = 0;
  const options = harness({ now: () => clock,
    listStatuses: async () => { clock = 101; return [{ state: 'success' }]; },
  });
  assert.equal((await waitForPreviewDeployment(options)).reason, 'build_timeout');
});
