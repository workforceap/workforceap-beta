// @vitest-environment node
/**
 * S03: a profile photo is checked against its bytes, not just its name.
 *
 * The route used to accept a 0-byte file and anything whose name ended in
 * .jpg/.png/.webp. It now refuses an empty file and bytes that are not a
 * JPEG, PNG or WebP image, with the copy members already see, and stores the
 * image under the type its bytes actually carry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: unknown[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/getMemberState', () => ({ invalidateMemberState: vi.fn(async () => undefined) }));

const { profile, bucket } = vi.hoisted(() => ({
  profile: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => ({})),
  },
  bucket: {
    upload: vi.fn(async (..._args: unknown[]) => ({ data: { path: 'p' }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    profile,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ profile })),
  },
}));

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn(() => ({ storage: { from: () => bucket } })) }));

import { POST } from '@/app/api/member/profile-photo/upload/route';
import { getUser } from '@/lib/auth/server';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function upload(bytes: number[], name: string) {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(bytes)], name));
  return POST(new Request('http://localhost/api/member/profile-photo/upload', { method: 'POST', body: fd }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUser).mockResolvedValue({ id: 'user-1', email: 'm@example.test' } as never);
});

describe('POST /api/member/profile-photo/upload', () => {
  it('refuses a 0-byte file', async () => {
    const res = await upload([], 'photo.png');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Provide a photo file' });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('refuses a .png whose bytes are HTML', async () => {
    const res = await upload(ascii('<html><script>alert(1)</script></html>'), 'photo.png');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use a JPG, PNG, or WebP photo' });
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(profile.upsert).not.toHaveBeenCalled();
  });

  it('uploads a real PNG', async () => {
    const res = await upload([...PNG_HEADER, 1, 2, 3, 4], 'photo.png');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: 'profile-photos/user-1/photo.webp' });
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(bucket.upload.mock.calls[0][2]).toMatchObject({ upsert: true, contentType: 'image/png' });
  });

  it('uploads a real WebP', async () => {
    const res = await upload([...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBPVP8 '), 0, 0], 'profile-photo.webp');

    expect(res.status).toBe(200);
    expect(bucket.upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/webp' });
  });

  it('stores the byte-derived type when the browser could not encode WebP and sent PNG under a .webp name', async () => {
    // WebKit's canvas.toBlob('image/webp') falls back to PNG; the editor always names the file .webp.
    const res = await upload([...PNG_HEADER, 9, 9], 'profile-photo.webp');

    expect(res.status).toBe(200);
    expect(bucket.upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/png' });
  });

  it('still refuses a name that is not an image extension', async () => {
    const res = await upload([...PNG_HEADER], 'photo.pdf');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use a JPG, PNG, or WebP photo' });
  });
});
