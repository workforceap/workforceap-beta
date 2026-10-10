import assert from 'node:assert/strict';
import test from 'node:test';
import { requestVoiceSession } from './requestVoiceSession';
import { MEMBER_REQUEST_FAILURE, MEMBER_REQUEST_TIMEOUT_MS } from './memberRequestFailure';

test('voice startup preserves the selected endpoint, payload and personalized context', async (t) => {
  const expected = { signedUrl: 'wss://voice.example.test/session', dynamicVariables: { first_name: 'Alex' }, agent: 'lilley_fallback' };
  const fetch = t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'include');
    assert.deepEqual(JSON.parse(String(init?.body)), { role: 'Cloud Support' });
    return Response.json(expected);
  });
  assert.deepEqual(await requestVoiceSession('/api/interview/session', { role: 'Cloud Support' }), expected);
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/interview/session');
});

test('voice outages hide internal JSON and HTML errors behind actionable retry copy', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'provider secret configuration failure' }, { status: 503 }));
  await assert.rejects(requestVoiceSession('/voice'), { message: MEMBER_REQUEST_FAILURE.unavailable });
  t.mock.method(globalThis, 'fetch', async () => new Response('<title>Bad gateway</title>', { status: 502 }));
  await assert.rejects(requestVoiceSession('/voice'), { message: MEMBER_REQUEST_FAILURE.unavailable });
});

test('expired voice sessions ask for sign-in and validation keeps the server instruction', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Unauthorized' }, { status: 401 }));
  await assert.rejects(requestVoiceSession('/voice'), { message: MEMBER_REQUEST_FAILURE.session });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Enter a target role.' }, { status: 400 }));
  await assert.rejects(requestVoiceSession('/voice'), { message: 'Enter a target role.' });
});

test('a lost connection gives connection guidance', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(requestVoiceSession('/voice'), { message: MEMBER_REQUEST_FAILURE.network });
});

test('a stalled voice URL request aborts at the member deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
    });
  });
  const pending = requestVoiceSession('/voice');
  t.mock.timers.tick(MEMBER_REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, { message: MEMBER_REQUEST_FAILURE.timeout });
  assert.equal(requestSignal?.aborted, true);
});

test('the deadline also aborts a response whose headers arrived but body stalled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  });
  const pending = requestVoiceSession('/voice');
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(MEMBER_REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, { message: MEMBER_REQUEST_FAILURE.timeout });
});

test('leaving the voice screen propagates caller cancellation', async (t) => {
  const cancellation = new AbortController();
  let requestSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
    });
  });
  const pending = requestVoiceSession('/voice', {}, cancellation.signal);
  cancellation.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requestSignal?.aborted, true);
});

test('malformed successful responses offer a retry instead of starting the voice client', async (t) => {
  for (const response of [new Response('<html>Proxy error</html>'), Response.json(null), Response.json({ signedUrl: 123 }), Response.json({ signedUrl: ' ' })]) {
    t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(requestVoiceSession('/voice'), { message: MEMBER_REQUEST_FAILURE.unavailable });
  }
});
