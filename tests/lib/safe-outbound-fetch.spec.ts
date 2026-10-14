// @vitest-environment node
/**
 * URL refusals for `assertPublicHttpUrl` are covered separately. These tests
 * pin the `safeFetch` wrapper that job-page scraping uses: private hosts must
 * never reach `fetch`, oversized bodies must abort mid-stream, and caller
 * options must not leak into the outbound request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetch, UnsafeUrlError } from '@/lib/http/safeOutboundFetch';

function chunkedBody(chunks: Uint8Array[], onCancel?: () => void) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    cancel() {
      onCancel?.();
    },
  });
}

function closedBody(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('safeFetch outbound caps', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('refuses private, metadata, and non-allowlisted URLs before fetching', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch('http://localhost:3000/admin')).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch('http://example.com/job', { httpsOnly: true })).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(safeFetch('https://attacker.test/?x=linkedin.com', { httpsOnly: true, allowHosts: ['linkedin.com'] }))
      .rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws and cancels the body when the response exceeds maxBytes', async () => {
    let cancelled = false;
    vi.mocked(fetch).mockResolvedValue(new Response(chunkedBody(
      [new Uint8Array(6).fill(1), new Uint8Array(6).fill(2)],
      () => { cancelled = true; },
    ), { status: 200 }));
    await expect(safeFetch('https://example.com/job', { maxBytes: 10 })).rejects.toMatchObject({
      name: 'UnsafeUrlError',
      message: 'Response exceeded 10 bytes',
    });
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it('returns a readable copy under the cap and strips wrapper options from fetch', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.mocked(fetch).mockResolvedValue(new Response(closedBody(new TextEncoder().encode('ok')), {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html' },
    }));
    const response = await safeFetch('https://jobs.example.com/posting', {
      allowHosts: ['example.com'],
      httpsOnly: true,
      timeoutMs: 15_000,
      maxBytes: 32,
      headers: { Accept: 'text/html' },
    });
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(fetch).toHaveBeenCalledOnce();
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://jobs.example.com/posting');
    expect(init.signal).toBe(timeout.mock.results[0]?.value);
    expect(init).not.toHaveProperty('maxBytes');
    expect(init).not.toHaveProperty('timeoutMs');
    expect(init).not.toHaveProperty('allowHosts');
    expect(init).not.toHaveProperty('httpsOnly');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(await response.text()).toBe('ok');
  });

  it('leaves an uncapped response body untouched', async () => {
    const original = new Response('full page', { status: 201 });
    vi.mocked(fetch).mockResolvedValue(original);
    const response = await safeFetch('https://example.com/job');
    expect(response).toBe(original);
    expect(await response.text()).toBe('full page');
  });
});
