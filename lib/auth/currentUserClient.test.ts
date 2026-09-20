import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_USER_ENDPOINT,
  fetchCurrentUser,
  peekCurrentUser,
  resetCurrentUserCache,
  subscribeCurrentUser,
} from './currentUserClient';

type FetchMock = ReturnType<typeof mock.fn<typeof fetch>>;

function installFetch(body: unknown, ok = true): FetchMock {
  const fetchMock = mock.fn<typeof fetch>(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }) as Response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  resetCurrentUserCache();
});

test('concurrent callers share one /api/auth/me request', async () => {
  const fetchMock = installFetch({ role: 'member', superAdmin: false, availablePortals: [] });
  const [a, b, c] = await Promise.all([fetchCurrentUser(), fetchCurrentUser(), fetchCurrentUser()]);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(fetchMock.mock.calls[0].arguments[0], CURRENT_USER_ENDPOINT);
  assert.deepEqual((fetchMock.mock.calls[0].arguments[1] as RequestInit).credentials, 'include');
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(a.role, 'member');
});

test('a fresh snapshot is reused; force refetches; stale snapshots refetch', async () => {
  const fetchMock = installFetch({ role: 'member', superAdmin: true });
  await fetchCurrentUser();
  await fetchCurrentUser();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(peekCurrentUser()?.superAdmin, true);

  await fetchCurrentUser({ force: true });
  assert.equal(fetchMock.mock.callCount(), 2);

  await fetchCurrentUser({ maxAgeMs: 0 });
  assert.equal(fetchMock.mock.callCount(), 3);
});

test('malformed payloads normalize to a safe snapshot', async () => {
  installFetch({ role: 42, availablePortals: 'nope', superAdmin: 'yes' });
  const snapshot = await fetchCurrentUser();
  assert.deepEqual(snapshot, {
    role: null, partner: null, employer: null, counselor: null,
    superAdmin: false, canAccessMemberDashboard: false, availablePortals: [],
  });
});

test('a failed request rejects waiting callers and keeps the earlier snapshot', async () => {
  installFetch({ role: 'member' });
  await fetchCurrentUser();
  installFetch({ error: 'boom' }, false);
  await assert.rejects(fetchCurrentUser({ force: true }));
  assert.equal(peekCurrentUser()?.role, 'member');
  // The failed in-flight request is released, so the next call tries again.
  const fetchMock = installFetch({ role: 'employer' });
  const next = await fetchCurrentUser({ force: true });
  assert.equal(next.role, 'employer');
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('subscribers hear loads and the signed-out reset', async () => {
  installFetch({ role: 'member' });
  const seen: Array<string | null> = [];
  const unsubscribe = subscribeCurrentUser((snapshot) => seen.push(snapshot.role));
  await fetchCurrentUser();
  resetCurrentUserCache();
  assert.equal(peekCurrentUser(), null);
  unsubscribe();
  await fetchCurrentUser();
  assert.deepEqual(seen, ['member', null]);
});
