// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FINANCE_MULTIPART_FILE_MAX_BYTES } from '@/lib/billing/twoStage/constants';

const uploadToSignedUrl = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl }) },
  }),
}));

import { uploadVoucherFile } from '@/lib/billing/twoStage/voucherDirectUploadClient';
import type { ApiResult } from '@/app/admin/members/[id]/billing/twoStageClient';

const MEMBER = 'member-1';
const CASE = 'case-1';
const SHA = 'a'.repeat(64);

function largePdf(): File {
  return {
    size: FINANCE_MULTIPART_FILE_MAX_BYTES + 1,
    name: 'voucher.pdf',
    arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
  } as File;
}

function ok<T>(data: T, status = 200): ApiResult<T> {
  return { ok: true, status, data };
}

function fail(status: number, message: string): ApiResult<never> {
  return { ok: false, status, body: null, message, uncertain: status === 0 };
}

describe('uploadVoucherFile direct-to-storage retry', () => {
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    uploadToSignedUrl.mockReset();
    vi.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
  });

  afterEach(() => {
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    if (env.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anon;
    vi.restoreAllMocks();
  });

  it('still completes when the signed PUT reports the object already exists', async () => {
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: 'The resource already exists' } });
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ bucket: 'billing-finance', path: `cases/${CASE}/voucher/${SHA}.pdf`, token: 'tok', sha256: SHA, byteLength: largePdf().size, maxBytes: 10 * 1024 * 1024 }))
      .mockResolvedValueOnce(ok({ artifact: { id: 'art-1' }, reused: true }, 201));

    const result = await uploadVoucherFile(MEMBER, CASE, largePdf(), request);
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[1][1]).toMatchObject({ json: { action: 'complete', fileName: 'voucher.pdf' } });
  });

  it('skips the signed PUT and completes when prepare returns an empty token', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(ok({ bucket: 'billing-finance', path: `cases/${CASE}/voucher/${SHA}.pdf`, token: '', sha256: SHA, byteLength: largePdf().size, maxBytes: 10 * 1024 * 1024 }))
      .mockResolvedValueOnce(ok({ artifact: { id: 'art-1' }, reused: true }, 201));

    const result = await uploadVoucherFile(MEMBER, CASE, largePdf(), request);
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
    expect(request.mock.calls.map((call) => call[1].json.action)).toEqual(['prepare', 'complete']);
  });

  it('still completes after prepare fails when storage already has the bytes', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(fail(503, 'The billing finance archive is not available. Reload the case before trying again.'))
      .mockResolvedValueOnce(ok({ artifact: { id: 'art-1' }, reused: true }, 201));

    const result = await uploadVoucherFile(MEMBER, CASE, largePdf(), request);
    expect(result).toMatchObject({ ok: true, status: 201 });
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
});
