const assert = require('node:assert/strict');
const { test } = require('node:test');

const origin = 'https://preview.example.test';
const request = (path, { method = 'GET', resourceType = 'fetch', headers = {} } = {}) => ({
  url: () => `${origin}${path}`,
  method: () => method,
  resourceType: () => resourceType,
  headers: () => headers,
});

test('pending paths use checked-in templates and redact unknown short IDs and queries', async () => {
  const { safePendingRequestPath } = await import('./portal-audit-pending.mjs');
  assert.equal(safePendingRequestPath(`${origin}/admin/dashboard?_rsc=PRIVATE_TOKEN`, origin),
    '/admin/dashboard');
  assert.equal(safePendingRequestPath(`${origin}/admin/members/member-123?token=PRIVATE_TOKEN`, origin),
    '/admin/members/[id]');
  assert.equal(safePendingRequestPath(`${origin}/api/admin/metrics?token=PRIVATE_TOKEN`, origin),
    '/api/admin/metrics');
  assert.equal(safePendingRequestPath(`${origin}/api/admin/members/member-123/status?token=PRIVATE_TOKEN`, origin),
    '/api/admin/members/[id]/status');
  assert.equal(safePendingRequestPath(`${origin}/api/private/jane-doe?token=PRIVATE_TOKEN`, origin),
    '/api/[redacted]');
  assert.equal(safePendingRequestPath(`${origin}/_next/data/PRIVATE_TOKEN.json`, origin),
    '/_next/[redacted]');
  assert.equal(safePendingRequestPath('https://evil.example.test/api/admin/metrics', origin),
    '/[redacted]');
  assert.equal(safePendingRequestPath('bad URL PRIVATE_TOKEN', origin), '/[invalid-url]');
});

test('timeout snapshot is bounded and drops browser-controlled strings and headers', async () => {
  const { recordPendingDataRequestTimeout } = await import('./portal-audit-pending.mjs');
  const errors = [];
  const inFlight = new Set();
  assert.equal(recordPendingDataRequestTimeout(inFlight, errors, 5000, origin), null);
  assert.deepEqual(errors, []);

  inFlight.add(request('/api/admin/members/member-123/status?access_token=PRIVATE_TOKEN', {
    headers: { rsc: '1', purpose: 'prefetch', authorization: 'Bearer PRIVATE_TOKEN' },
  }));
  inFlight.add(request('/counselor/placements?_rsc=PRIVATE_TOKEN', {
    method: 'POST', resourceType: 'xhr', headers: { cookie: 'PRIVATE_TOKEN' },
  }));
  for (let index = 0; index < 12; index += 1) {
    inFlight.add(request(`/api/private/member-${index}?secret=PRIVATE_TOKEN`));
  }
  const snapshot = recordPendingDataRequestTimeout(inFlight, errors, 5000, origin);
  assert.equal(snapshot.count, 14);
  assert.equal(snapshot.requests.length, 10);
  assert.deepEqual(snapshot.requests[0], {
    method: 'GET', path: '/api/admin/members/[id]/status',
    resourceType: 'fetch', prefetch: true, rsc: true,
  });
  assert.deepEqual(snapshot.requests[1], {
    method: 'POST', path: '/counselor/placements',
    resourceType: 'xhr', prefetch: false, rsc: true,
  });
  assert.deepEqual(errors, ['Same-origin data requests did not settle within 5000ms (14 pending)']);
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_TOKEN|member-123|member-\d|jane-doe|authorization|cookie/);

  inFlight.clear();
  assert.equal(recordPendingDataRequestTimeout(inFlight, errors, 5000, origin), null);
  assert.equal(errors.length, 1);
});

test('snapshot rejects out-of-origin and non-data metadata without changing timeout count', async () => {
  const { recordPendingDataRequestTimeout } = await import('./portal-audit-pending.mjs');
  const inFlight = new Set([
    request('/api/counselor/placements?private=1', { method: 'ARBITRARY_SECRET' }),
    { ...request('/api/counselor/placements'), url: () => 'https://evil.test/member-123' },
    request('/api/counselor/placements', { resourceType: 'image' }),
  ]);
  const snapshot = recordPendingDataRequestTimeout(inFlight, [], 100, origin);
  assert.equal(snapshot.count, 3);
  assert.deepEqual(snapshot.requests, [{
    method: 'OTHER', path: '/api/counselor/placements',
    resourceType: 'fetch', prefetch: false, rsc: false,
  }]);
});

test('diagnostic read errors cannot replace the existing settlement failure', async () => {
  const { recordPendingDataRequestTimeout } = await import('./portal-audit-pending.mjs');
  const errors = [];
  const poisoned = request('/api/admin/metrics?private=1', {
    headers: new Proxy({}, { has: () => { throw new Error('private header'); } }),
  });
  assert.deepEqual(recordPendingDataRequestTimeout(new Set([poisoned]), errors, 5000, origin), {
    count: 1, requests: [],
  });
  assert.deepEqual(errors, ['Same-origin data requests did not settle within 5000ms (1 pending)']);
});
