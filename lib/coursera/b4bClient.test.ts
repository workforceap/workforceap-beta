import test from 'node:test';
import assert from 'node:assert/strict';

import {
  B4BApiError,
  _getCachedTokenForTesting,
  _resetTokenCacheForTesting,
  _setFetchForTesting,
  createProgramMembership,
  enrollUserInCourse,
  fetchB4B,
  getEnrollmentReports,
  getOrgInfo,
  inviteUserToProgram,
  listPrograms,
  listUsers,
} from './b4bClient';

const ORIGINAL_ENV: Record<string, string | undefined> = {};
function snapshotEnv() {
  for (const k of [
    'COURSERA_B4B_CLIENT_ID',
    'COURSERA_B4B_CLIENT_SECRET',
    'COURSERA_API_BASE_URL',
    'COURSERA_B4B_API_BASE_URL',
    'COURSERA_OAUTH_TOKEN_URL',
    'COURSERA_ORG_ID',
  ]) {
    ORIGINAL_ENV[k] = process.env[k];
  }
}
function restoreEnv() {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function jsonResponse(payload: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

type Call = { url: string; init?: RequestInit };

function setupTestEnv() {
  snapshotEnv();
  process.env.COURSERA_B4B_CLIENT_ID = 'test-client-id';
  process.env.COURSERA_B4B_CLIENT_SECRET = 'test-client-secret';
  process.env.COURSERA_API_BASE_URL = 'https://api.coursera.com/ent';
  process.env.COURSERA_OAUTH_TOKEN_URL = 'https://api.coursera.com/oauth2/client_credentials/token';
  process.env.COURSERA_ORG_ID = 'TEST_ORG_ID';
  _resetTokenCacheForTesting();
}

function teardownTestEnv() {
  _setFetchForTesting(null);
  _resetTokenCacheForTesting();
  restoreEnv();
}

test('normalizes documented decimal-string paging offsets without widening the client contract', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);
  _setFetchForTesting(async (url) => jsonResponse(url.includes('/oauth2/')
    ? { access_token: 'fixture-token', expires_in: 1799 }
    : { elements: [], paging: { next: '200', total: 450 } }));
  assert.deepEqual((await listPrograms()).paging, { next: 200, total: 450 });
});

test('rejects opaque paging cursors instead of silently truncating the response', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);
  _setFetchForTesting(async (url) => jsonResponse(url.includes('/oauth2/')
    ? { access_token: 'fixture-token', expires_in: 1799 }
    : { elements: [], paging: { next: 'opaque:200' } }));
  await assert.rejects(() => listPrograms(), /unsupported pagination cursor/);
});

test('first call fetches token then makes the API request', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  const calls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/oauth2/client_credentials/token')) {
      return jsonResponse({ access_token: 'tok-A', token_type: 'Bearer', expires_in: 1799 });
    }
    return jsonResponse({ id: 'TEST_ORG_ID', name: 'Workforce Advancement Project' });
  });

  const orgInfo = await getOrgInfo();
  assert.equal(orgInfo.name, 'Workforce Advancement Project');
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/oauth2\/client_credentials\/token$/);
  assert.equal(calls[1].url, 'https://api.coursera.com/ent/api/businesses.v1/TEST_ORG_ID');

  // Verify Authorization headers
  const tokenAuth = (calls[0].init?.headers as Record<string, string> | undefined)?.Authorization;
  assert.ok(tokenAuth?.startsWith('Basic '), 'token request uses Basic auth');
  // The Bearer header is set as a Headers instance, but Headers is iterable.
  const apiHeaders = new Headers(calls[1].init?.headers);
  assert.equal(apiHeaders.get('Authorization'), 'Bearer tok-A');
});

test('second call within TTL reuses cached token (no second oauth fetch)', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let oauthCalls = 0;
  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/client_credentials/token')) {
      oauthCalls += 1;
      return jsonResponse({ access_token: 'tok-B', expires_in: 1799 });
    }
    return jsonResponse({ elements: [], paging: { total: 0 } });
  });

  await listUsers({ limit: 5 });
  await listUsers({ limit: 5 });
  await listUsers({ limit: 5 });

  assert.equal(oauthCalls, 1, 'OAuth token reused across three API calls');

  const cached = _getCachedTokenForTesting();
  assert.ok(cached);
  assert.equal(cached?.token, 'tok-B');
  assert.ok(cached!.expiresAt > Date.now() + 60_000);
});

test('token near-expiry triggers a refresh on the next call', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let oauthCalls = 0;
  let tokenLabel = 'tok-1';
  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/client_credentials/token')) {
      oauthCalls += 1;
      const issued = tokenLabel;
      tokenLabel = 'tok-2';
      return jsonResponse({ access_token: issued, expires_in: 1799 });
    }
    return jsonResponse({ id: 'TEST_ORG_ID', name: 'WAP' });
  });

  await getOrgInfo();
  assert.equal(oauthCalls, 1);

  // Force the cached token to be on the brink of expiry (within the 60s
  // safety margin). The next call should refresh.
  const cached = _getCachedTokenForTesting();
  assert.ok(cached);
  cached!.expiresAt = Date.now() + 5_000; // 5s left

  await getOrgInfo();
  assert.equal(oauthCalls, 2, 'token refreshed when within safety margin');

  const cached2 = _getCachedTokenForTesting();
  assert.equal(cached2?.token, 'tok-2', 'new token cached');
});

test('non-2xx API response throws B4BApiError with status, body, url', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/client_credentials/token')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    return textResponse('{"errorCode":"FORBIDDEN","details":"bad scope"}', 403);
  });

  await assert.rejects(
    () => listPrograms({ limit: 5 }),
    (err: unknown) => {
      if (!(err instanceof B4BApiError)) return false;
      assert.equal(err.status, 403);
      assert.match(err.body, /FORBIDDEN/);
      assert.match(err.url, /\/businesses\.v1\/TEST_ORG_ID\/programs/);
      return true;
    },
  );
});

test('listPrograms forces excludeContent=true unless caller opts out', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  const urls: string[] = [];
  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    urls.push(url);
    return jsonResponse({ elements: [], paging: { total: 0 } });
  });

  await listPrograms({ limit: 5 });
  assert.match(urls[0], /excludeContent=true/);

  await listPrograms({ limit: 5, excludeContent: false });
  assert.match(urls[1], /excludeContent=false/);
});

test('getEnrollmentReports encodes byProgramId and byUserProgramId param shape', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  const urls: string[] = [];
  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    urls.push(url);
    return jsonResponse({ elements: [], paging: { total: 0 } });
  });

  await getEnrollmentReports({ byProgramId: true, programId: 'PRG-123', limit: 50 });
  await getEnrollmentReports({
    byUserProgramId: true,
    programId: 'PRG-123',
    externalId: 'drew@example.com',
    limit: 50,
  });

  // q=byProgramId&programId=PRG-123&limit=50
  const u1 = new URL(urls[0]);
  assert.equal(u1.searchParams.get('q'), 'byProgramId');
  assert.equal(u1.searchParams.get('programId'), 'PRG-123');
  assert.equal(u1.searchParams.get('limit'), '50');

  // q=byUserProgramId&programId=PRG-123&externalId=drew@example.com
  const u2 = new URL(urls[1]);
  assert.equal(u2.searchParams.get('q'), 'byUserProgramId');
  assert.equal(u2.searchParams.get('programId'), 'PRG-123');
  assert.equal(u2.searchParams.get('externalId'), 'drew@example.com');
});

test('OAuth failure throws B4BApiError before any API call', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let apiCalls = 0;
  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/')) {
      return textResponse('invalid_client', 401);
    }
    apiCalls += 1;
    return jsonResponse({});
  });

  await assert.rejects(
    () => fetchB4B('/api/businesses.v1/TEST_ORG_ID'),
    (err: unknown) =>
      err instanceof B4BApiError && err.status === 401 && err.body.includes('invalid_client'),
  );
  assert.equal(apiCalls, 0, 'no API call attempted when OAuth fails');
});

/* ------------------------------------------------------------------ */
/*  Write endpoints                                                    */
/* ------------------------------------------------------------------ */

test('inviteUserToProgram POSTs JSON body, reuses cached token, returns ok=true with parsed data', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let oauthCalls = 0;
  const apiCalls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    if (url.includes('/oauth2/')) {
      oauthCalls += 1;
      return jsonResponse({ access_token: 'tok-W', expires_in: 1799 });
    }
    apiCalls.push({ url, init });
    return jsonResponse({
      id: 'INV-1',
      externalId: 'drew@example.com',
      state: 'PENDING',
    }, { status: 201 });
  });

  // Two writes back-to-back so we can verify the OAuth token cache is
  // reused (single client_credentials hit, two API calls).
  const r1 = await inviteUserToProgram('ORG-1', 'PRG-1', {
    externalId: 'drew@example.com',
    fullName: 'Drew Harris',
    email: 'drew@example.com',
  });
  const r2 = await inviteUserToProgram('ORG-1', 'PRG-1', {
    externalId: 'two@example.com',
    email: 'two@example.com',
    sendEmail: false,
  });

  assert.equal(oauthCalls, 1, 'token cache reused across writes');
  assert.equal(apiCalls.length, 2);
  assert.equal(
    apiCalls[0].url,
    'https://api.coursera.com/ent/api/businesses.v1/ORG-1/programs/PRG-1/invitations',
  );

  const headers = new Headers(apiCalls[0].init?.headers);
  assert.equal(headers.get('Authorization'), 'Bearer tok-W');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(apiCalls[0].init?.method, 'POST');

  const body1 = JSON.parse(apiCalls[0].init?.body as string) as Record<string, unknown>;
  assert.equal(body1.externalId, 'drew@example.com');
  assert.equal(body1.email, 'drew@example.com');
  assert.equal(body1.fullName, 'Drew Harris');
  assert.equal(body1.sendEmail, true, 'sendEmail defaults to true');

  const body2 = JSON.parse(apiCalls[1].init?.body as string) as Record<string, unknown>;
  assert.equal(body2.sendEmail, false, 'caller-supplied sendEmail=false respected');

  assert.equal(r1.ok, true);
  if (r1.ok) {
    assert.equal(r1.status, 201);
    assert.equal(r1.data.id, 'INV-1');
    assert.equal(r1.data.externalId, 'drew@example.com');
  }
  assert.equal(r2.ok, true);
});

test('createProgramMembership posts to /memberships with sendWelcomeEmail default false', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  const apiCalls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    apiCalls.push({ url, init });
    return jsonResponse({
      id: 'MEM-9',
      externalId: 'd@example.com',
      programId: 'PRG-9',
      state: 'ACTIVE',
    });
  });

  const result = await createProgramMembership('ORG-9', 'PRG-9', {
    externalId: 'd@example.com',
    email: 'd@example.com',
  });

  assert.equal(apiCalls.length, 1);
  assert.equal(
    apiCalls[0].url,
    'https://api.coursera.com/ent/api/businesses.v1/ORG-9/programs/PRG-9/memberships',
  );
  const body = JSON.parse(apiCalls[0].init?.body as string) as Record<string, unknown>;
  assert.equal(body.sendWelcomeEmail, false, 'sendWelcomeEmail defaults to false (we use our own toast)');

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.id, 'MEM-9');
    assert.equal(result.data.programId, 'PRG-9');
  }
});

test('enrollUserInCourse posts contentType + action and returns ok=true', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  const apiCalls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    apiCalls.push({ url, init });
    return jsonResponse({
      id: 'ENR-1',
      externalId: 'd@example.com',
      contentId: 'CRS-7',
      contentType: 'Course',
      state: 'ENROLLED',
    });
  });

  const result = await enrollUserInCourse('ORG-A', 'PRG-A', {
    externalId: 'd@example.com',
    contentType: 'Course',
    contentId: 'CRS-7',
    action: 'ENROLL',
  });

  assert.equal(apiCalls.length, 1);
  assert.equal(
    apiCalls[0].url,
    'https://api.coursera.com/ent/api/businesses.v1/ORG-A/programs/PRG-A/programEnrollments',
  );
  const body = JSON.parse(apiCalls[0].init?.body as string) as Record<string, unknown>;
  assert.equal(body.contentId, 'CRS-7');
  assert.equal(body.contentType, 'Course');
  assert.equal(body.action, 'ENROLL');

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 200);
    assert.equal(result.data.id, 'ENR-1');
  }
});

test('write methods do NOT throw on 4xx — they return ok=false with status + error', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    return new Response(
      JSON.stringify({ errorCode: 'ALREADY_ENROLLED', message: 'User already enrolled' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  });

  const result = await enrollUserInCourse('ORG-X', 'PRG-X', {
    externalId: 'e@example.com',
    contentType: 'Course',
    contentId: 'CRS-X',
    action: 'ENROLL',
  });

  // Critical: discriminated union — caller must be able to switch on
  // status WITHOUT a try/catch wrapper, so the state-machine route can
  // fold a 400 ALREADY_ENROLLED into status='already-enrolled' instead
  // of 500ing the request.
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /already enrolled/i);
    assert.match(result.body ?? '', /ALREADY_ENROLLED/);
  }
});

test('write methods surface 5xx with body for caller diagnostics', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  _setFetchForTesting(async (url) => {
    if (url.includes('/oauth2/')) {
      return jsonResponse({ access_token: 'tok', expires_in: 1799 });
    }
    return new Response('upstream timeout', { status: 503 });
  });

  const result = await inviteUserToProgram('O', 'P', {
    externalId: 'x@example.com',
    email: 'x@example.com',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.body, 'upstream timeout');
  }
});

test('missing credentials are rejected before the first network call', async (t) => {
  snapshotEnv();
  process.env.COURSERA_ORG_ID = 'TEST_ORG_ID';
  delete process.env.COURSERA_B4B_CLIENT_ID;
  delete process.env.COURSERA_B4B_CLIENT_SECRET;
  _resetTokenCacheForTesting();
  t.after(() => {
    restoreEnv();
    _resetTokenCacheForTesting();
    _setFetchForTesting(null);
  });

  _setFetchForTesting(async () => {
    throw new Error('fetch should not be called when creds are missing');
  });

  await assert.rejects(
    () => listUsers(),
    (err: unknown) =>
      err instanceof Error && /COURSERA_B4B_CLIENT_ID/.test(err.message),
  );
});

test('B4B fetch times out a hung upstream instead of hanging (regression: dashboard 504 2026-06-18)', async (t) => {
  // Root cause of the incident: the OAuth/API fetch had NO timeout, so a slow
  // upstream blocked the awaiting RSC render past Vercel's function limit → 504.
  // With COURSERA_B4B_TIMEOUT_MS set low, a fetch that never settles in time
  // must REJECT fast (not hang to the injected 5s delay).
  setupTestEnv();
  process.env.COURSERA_B4B_TIMEOUT_MS = '80';
  t.after(() => {
    teardownTestEnv();
    delete process.env.COURSERA_B4B_TIMEOUT_MS;
  });

  // Injected fetch simulates a hung Coursera B4B: resolves only after 5s.
  _setFetchForTesting(
    () => new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({ ok: true })), 5000)),
  );

  const start = Date.now();
  await assert.rejects(
    () => getOrgInfo(),
    (err: unknown) => err instanceof Error && /timed out/i.test(err.message),
    'a hung upstream should reject with a timeout error',
  );
  const elapsed = Date.now() - start;
  // Without the timeout this waits the full 5s; with it, ~80ms + overhead.
  assert.ok(elapsed < 1500, `expected fast timeout rejection, took ${elapsed}ms`);
});

test('B4B timeout defaults to 4000ms when COURSERA_B4B_TIMEOUT_MS is unset/invalid', async (t) => {
  // Guards the env parse: invalid values must fall back to the safe default,
  // never 0/NaN (which would time out every call instantly).
  setupTestEnv();
  process.env.COURSERA_B4B_TIMEOUT_MS = 'not-a-number';
  t.after(() => {
    teardownTestEnv();
    delete process.env.COURSERA_B4B_TIMEOUT_MS;
  });

  // A fast successful fetch must still succeed (default 4s budget, not 0).
  _setFetchForTesting(async (url: string) => {
    if (/\/oauth2\//.test(url)) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
    return jsonResponse({ elements: [{ name: 'Workforce Advancement Project' }] });
  });

  const info = await getOrgInfo();
  assert.ok(info, 'invalid timeout env must fall back to default, not break the call');
});

test('legacy rest/v1 COURSERA_API_BASE_URL is ignored by B4B calls (env-collision guard)', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);
  // The legacy skillset client's base — appending /api/businesses.v1 paths to
  // it 404s, so getApiBase must fall back to the default /ent base instead.
  process.env.COURSERA_API_BASE_URL = 'https://api.coursera.com/ent/api/rest/v1';
  delete process.env.COURSERA_B4B_API_BASE_URL;

  const calls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('oauth2')) return jsonResponse({ access_token: 'tok', expires_in: 1800 });
    return jsonResponse({ elements: [] });
  });

  await fetchB4B('/api/businesses.v1/ORG/users');
  const apiCall = calls.find((c) => c.url.includes('businesses.v1'));
  assert.ok(apiCall, 'expected an API call');
  assert.ok(
    apiCall.url.startsWith('https://api.coursera.com/ent/api/businesses.v1/'),
    `legacy rest/v1 base must not leak into B4B URLs, got ${apiCall.url}`,
  );
});

test('COURSERA_B4B_API_BASE_URL takes precedence for B4B calls', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);
  process.env.COURSERA_API_BASE_URL = 'https://api.coursera.com/ent/api/rest/v1';
  process.env.COURSERA_B4B_API_BASE_URL = 'https://b4b.example.test/ent/';

  const calls: Call[] = [];
  _setFetchForTesting(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('oauth2')) return jsonResponse({ access_token: 'tok', expires_in: 1800 });
    return jsonResponse({ elements: [] });
  });

  await fetchB4B('/api/businesses.v1/ORG/users');
  const apiCall = calls.find((c) => c.url.includes('businesses.v1'));
  assert.ok(apiCall, 'expected an API call');
  assert.ok(
    apiCall.url.startsWith('https://b4b.example.test/ent/api/businesses.v1/'),
    `B4B-specific base (trailing slash trimmed) must win, got ${apiCall.url}`,
  );
});

test('401 on a CACHED token re-mints once and replays the request', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let oauthCount = 0;
  const apiAuthHeaders: string[] = [];
  _setFetchForTesting(async (url, init) => {
    if (url.includes('oauth2')) {
      oauthCount += 1;
      return jsonResponse({ access_token: `tok-${oauthCount}`, expires_in: 1800 });
    }
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    apiAuthHeaders.push(auth);
    // First API call succeeds (seeds the cache); the next one 401s on the
    // cached token (server-side revocation) and must succeed on replay.
    if (apiAuthHeaders.length === 2) return textResponse('token revoked', 401);
    return jsonResponse({ ok: true });
  });

  const first = await fetchB4B('/api/businesses.v1/ORG/one');
  assert.equal(first.status, 200);
  const second = await fetchB4B('/api/businesses.v1/ORG/two');
  assert.equal(second.status, 200, '401 on cached token must be retried after re-mint');
  assert.equal(oauthCount, 2, 'exactly one re-mint');
  assert.deepEqual(apiAuthHeaders, ['Bearer tok-1', 'Bearer tok-1', 'Bearer tok-2']);
});

test('401 on a FRESHLY minted token is surfaced, not retried (no loop on bad credentials)', async (t) => {
  setupTestEnv();
  t.after(teardownTestEnv);

  let oauthCount = 0;
  let apiCount = 0;
  _setFetchForTesting(async (url) => {
    if (url.includes('oauth2')) {
      oauthCount += 1;
      return jsonResponse({ access_token: 'tok', expires_in: 1800 });
    }
    apiCount += 1;
    return textResponse('nope', 401);
  });

  const res = await fetchB4B('/api/businesses.v1/ORG/users');
  assert.equal(res.status, 401);
  assert.equal(oauthCount, 1, 'no re-mint for a fresh-token 401');
  assert.equal(apiCount, 1, 'no replay for a fresh-token 401');
});
