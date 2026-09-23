// @vitest-environment node
/**
 * S03: the mock-interview recording route trusts only what storage holds.
 *
 * `prepare` hands out a signed upload URL into the private member-resumes
 * bucket, so it is rate-limited per member. `complete` used to save the
 * client's own `byteSize` and `mimeType`; it now reads the stored object's
 * metadata, refuses (and removes) an empty, oversized or non-video object,
 * refuses a path with no object behind it, and saves the server-read values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkResumeUploadRateLimit: vi.fn() }));
vi.mock('@/lib/ai/saveResult', () => ({ saveAIToolResult: vi.fn(async () => ({ id: 'r-1' })) }));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));

const storage = {
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
};
const from = vi.fn(() => storage);
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn(() => ({ storage: { from } })) }));

import { POST } from '@/app/api/member/voice-interview/recording/route';
import { getUser } from '@/lib/auth/server';
import { checkResumeUploadRateLimit } from '@/lib/rate-limit';
import { saveAIToolResult } from '@/lib/ai/saveResult';

const USER_ID = 'user-1';
const PATH = `${USER_ID}/voice-interview-recordings/0f8fad5b-d9cb-469f-a165-70867728950e.webm`;
const MAX = 200 * 1024 * 1024;

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/member/voice-interview/recording', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

function complete(overrides: Record<string, unknown> = {}) {
  return post({
    action: 'complete',
    path: PATH,
    durationMs: 42_000,
    role: 'Analyst',
    interviewType: 'Behavioral',
    mimeType: 'video/webm',
    byteSize: 1024,
    ...overrides,
  });
}

function storedObject(size: number, contentType: string) {
  return {
    data: { name: PATH, size, contentType, metadata: { size, mimetype: contentType } },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: USER_ID, email: 'm@example.test' } as never);
  vi.mocked(checkResumeUploadRateLimit).mockResolvedValue({ success: true });
  storage.createSignedUploadUrl.mockResolvedValue({ data: { path: PATH, token: 'tok' }, error: null });
  storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/play' }, error: null });
  storage.remove.mockResolvedValue({ data: [], error: null });
  storage.info.mockResolvedValue(storedObject(2048, 'video/webm'));
});

describe('prepare', () => {
  it('returns 429 over the per-member limit and hands out no upload URL', async () => {
    vi.mocked(checkResumeUploadRateLimit).mockResolvedValue({ success: false, remaining: 0 });

    const res = await post({ action: 'prepare', fileExt: 'webm' });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many recording uploads. Try again in a few minutes.' });
    expect(checkResumeUploadRateLimit).toHaveBeenCalledWith(`voice-recording:${USER_ID}`);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('still prepares an upload under the limit', async () => {
    const res = await post({ action: 'prepare', fileExt: 'webm' });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ bucket: 'member-resumes', path: PATH, token: 'tok' });
    expect(storage.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe('complete', () => {
  it('refuses and removes an object larger than the max even when the body claims 1 KB', async () => {
    storage.info.mockResolvedValue(storedObject(MAX + 1, 'video/webm'));

    const res = await complete({ byteSize: 1024 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Recording too large' });
    expect(storage.remove).toHaveBeenCalledWith([PATH]);
    expect(saveAIToolResult).not.toHaveBeenCalled();
  });

  it('refuses and removes an empty object', async () => {
    storage.info.mockResolvedValue(storedObject(0, 'video/webm'));

    const res = await complete();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Recording is empty' });
    expect(storage.remove).toHaveBeenCalledWith([PATH]);
    expect(saveAIToolResult).not.toHaveBeenCalled();
  });

  it('returns 409 and saves nothing when no object was uploaded at the path', async () => {
    storage.info.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Object not found'), { status: 400, statusCode: '404' }),
    });

    const res = await complete();

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Recording upload not found' });
    expect(saveAIToolResult).not.toHaveBeenCalled();
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it('refuses and removes an object stored as text/html', async () => {
    storage.info.mockResolvedValue(storedObject(4096, 'text/html'));

    const res = await complete({ mimeType: 'video/webm' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unsupported recording type' });
    expect(storage.remove).toHaveBeenCalledWith([PATH]);
    expect(saveAIToolResult).not.toHaveBeenCalled();
  });

  it('still answers 400 when removing the refused object fails', async () => {
    storage.info.mockResolvedValue(storedObject(4096, 'text/html'));
    storage.remove.mockRejectedValue(new Error('storage down'));

    const res = await complete();

    expect(res.status).toBe(400);
    expect(saveAIToolResult).not.toHaveBeenCalled();
  });

  it('saves the server-read size and type for a real recording, not the body values', async () => {
    storage.info.mockResolvedValue(storedObject(5_000_000, 'video/webm;codecs=vp9,opus'));

    const res = await complete({ byteSize: 12, mimeType: 'video/mp4' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: PATH, playbackUrl: 'https://signed.example/play' });
    expect(storage.info).toHaveBeenCalledWith(PATH);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(saveAIToolResult).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(vi.mocked(saveAIToolResult).mock.calls[0][3] as string);
    expect(payload).toMatchObject({
      storagePath: PATH,
      byteSize: 5_000_000,
      mimeType: 'video/webm;codecs=vp9,opus',
      durationMs: 42_000,
    });
  });

  it('accepts an mp4 recording', async () => {
    storage.info.mockResolvedValue(storedObject(3_000_000, 'video/mp4'));

    const res = await complete({ path: PATH.replace(/\.webm$/, '.mp4') });

    expect(res.status).toBe(200);
    expect(saveAIToolResult).toHaveBeenCalledTimes(1);
  });
});
