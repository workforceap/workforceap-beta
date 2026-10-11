import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithTimeout } from './fetchWithTimeout';

test('three-argument callers still receive the response and clear their deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const response = Response.json({ ok: true });
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return response;
  });
  assert.equal(await fetchWithTimeout('/test', {}, 10), response);
  t.mock.timers.tick(20);
  assert.equal(requestSignal?.aborted, false);
});

test('a completed response consumer clears the deadline and parent abort listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const parent = new AbortController();
  const remove = t.mock.method(parent.signal, 'removeEventListener');
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return Response.json({ name: 'Alex' });
  });
  assert.deepEqual(await fetchWithTimeout('/test', { signal: parent.signal }, 10, (response) => response.json()), { name: 'Alex' });
  t.mock.timers.tick(20);
  parent.abort();
  assert.equal(requestSignal?.aborted, false);
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(remove.mock.calls[0].arguments[0], 'abort');
});

test('parent cancellation remains attached while a response body is consumed', async (t) => {
  const parent = new AbortController();
  let reading: () => void = () => {};
  const startedReading = new Promise<void>((resolve) => { reading = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
    },
  })));
  const pending = fetchWithTimeout('/test', { signal: parent.signal }, 1000, (response) => { reading(); return response.json(); });
  await startedReading;
  const reason = new Error('Navigation canceled');
  parent.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
});

test('a consumer cannot hide its deadline by swallowing the body abort', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reading: () => void = () => {};
  const startedReading = new Promise<void>((resolve) => { reading = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
    },
  })));
  const pending = fetchWithTimeout('/test', {}, 10, async (response) => {
    reading();
    return response.json().catch(() => ({ fallback: true }));
  });
  await startedReading;
  t.mock.timers.tick(10);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a failed consumer also releases its deadline and cancellation listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const parent = new AbortController();
  const remove = t.mock.method(parent.signal, 'removeEventListener');
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return new Response('not JSON');
  });
  await assert.rejects(fetchWithTimeout('/test', { signal: parent.signal }, 10, (response) => response.json()), { name: 'SyntaxError' });
  t.mock.timers.tick(20);
  parent.abort();
  assert.equal(requestSignal?.aborted, false);
  assert.equal(remove.mock.callCount(), 1);
});
