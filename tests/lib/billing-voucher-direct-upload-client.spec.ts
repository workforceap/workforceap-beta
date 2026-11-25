// @vitest-environment node
/**
 * Browser voucher upload (#2901): files up to ~4 MB stay on the multipart
 * route; larger PDFs hash locally, prepare a signed URL, then complete.
 * Size gates must refuse before any network or Storage call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  createBrowserClient: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

import { FINANCE_MULTIPART_FILE_MAX_BYTES, MAX_UPLOAD_BYTES } from '@/lib/billing/twoStage/constants';
import { uploadVoucherFile } from '@/lib/billing/twoStage/voucherDirectUploadClient';

const MEMBER = 'member/id';
const CASE = 'case id';
const VOUCHER_PATH = `/api/admin/members/${encodeURIComponent(MEMBER)}/billing/two-stage/cases/${encodeURIComponent(CASE)}/voucher`;

function fileOf(size: number, name = 'voucher.pdf'): File {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const file = new File([bytes], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('uploadVoucherFile client gates and direct-to-storage protocol', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.createBrowserClient.mockReset();
    mocks.uploadToSignedUrl.mockReset();
    mocks.createBrowserClient.mockReturnValue({
      storage: { from: () => ({ uploadToSignedUrl: mocks.uploadToSignedUrl }) },
    });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('refuses an empty file or a file over 10 MB before calling the API', async () => {
    const empty = await uploadVoucherFile(MEMBER, CASE, fileOf(0), mocks.request);
    expect(empty).toEqual({ ok: false, status: 422, body: null, message: 'The file is empty.', uncertain: false });

    const tooBig = await uploadVoucherFile(MEMBER, CASE, fileOf(MAX_UPLOAD_BYTES + 1), mocks.request);
    expect(tooBig).toEqual({
      ok: false,
      status: 413,
      body: null,
      message: 'The file is larger than 10 MB.',
      uncertain: false,
    });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it('posts multipart for files at the Vercel-safe cap and encodes the case path', async () => {
    mocks.request.mockResolvedValueOnce({ ok: true, status: 201, data: { artifact: { id: 'art-1' } } });
    const file = fileOf(FINANCE_MULTIPART_FILE_MAX_BYTES);
    await uploadVoucherFile(MEMBER, CASE, file, mocks.request);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const [path, opts] = mocks.request.mock.calls[0] as [string, { method: string; form: FormData }];
    expect(path).toBe(VOUCHER_PATH);
    expect(opts.method).toBe('POST');
    expect(opts.form).toBeInstanceOf(FormData);
    const uploaded = opts.form.get('file');
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('voucher.pdf');
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });

  it('prepares, uploads to the signed URL, then completes for a 6 MB file', async () => {
    const sha = 'ab'.repeat(32);
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(Uint8Array.from({ length: 32 }, () => 0xab).buffer);
    mocks.request
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { bucket: 'billing-finance', path: 'cases/x/voucher/ab.pdf', token: 'tok', sha256: sha, byteLength: 6 * 1024 * 1024, maxBytes: MAX_UPLOAD_BYTES },
      })
      .mockResolvedValueOnce({ ok: true, status: 201, data: { artifact: { id: 'art-direct' }, reused: false } });
    mocks.uploadToSignedUrl.mockResolvedValueOnce({ error: null });

    const file = fileOf(6 * 1024 * 1024, 'board-voucher.pdf');
    const result = await uploadVoucherFile(MEMBER, CASE, file, mocks.request);
    expect(result).toMatchObject({ ok: true, status: 201, data: { artifact: { id: 'art-direct' } } });
    expect(mocks.request.mock.calls[0]).toEqual([
      VOUCHER_PATH,
      { method: 'POST', json: { action: 'prepare', sha256: sha, byteLength: 6 * 1024 * 1024, fileName: 'board-voucher.pdf' } },
    ]);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon');
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith(
      'cases/x/voucher/ab.pdf',
      'tok',
      file,
      { contentType: 'application/pdf', upsert: false },
    );
    expect(mocks.request.mock.calls[1]).toEqual([
      VOUCHER_PATH,
      { method: 'POST', json: { action: 'complete', sha256: sha, byteLength: 6 * 1024 * 1024, fileName: 'board-voucher.pdf' } },
    ]);
  });

  it('returns the prepare refusal and marks Storage/config failures as uncertain without completing', async () => {
    mocks.request.mockResolvedValueOnce({ ok: false, status: 413, body: null, message: 'The file is larger than 10 MB.', uncertain: false });
    const refused = await uploadVoucherFile(MEMBER, CASE, fileOf(6 * 1024 * 1024), mocks.request);
    expect(refused.status).toBe(413);
    expect(mocks.uploadToSignedUrl).not.toHaveBeenCalled();

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mocks.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { bucket: 'billing-finance', path: 'p', token: 'tok', sha256: 'a'.repeat(64), byteLength: 6 * 1024 * 1024, maxBytes: MAX_UPLOAD_BYTES },
    });
    const missingEnv = await uploadVoucherFile(MEMBER, CASE, fileOf(6 * 1024 * 1024), mocks.request);
    expect(missingEnv).toEqual({ ok: false, status: 0, body: null, message: 'App configuration error.', uncertain: true });
    expect(mocks.request).toHaveBeenCalledTimes(2);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    mocks.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { bucket: 'billing-finance', path: 'p', token: 'tok', sha256: 'a'.repeat(64), byteLength: 6 * 1024 * 1024, maxBytes: MAX_UPLOAD_BYTES },
    });
    mocks.uploadToSignedUrl.mockResolvedValueOnce({ error: { message: 'quota' } });
    const uploadFailed = await uploadVoucherFile(MEMBER, CASE, fileOf(6 * 1024 * 1024), mocks.request);
    expect(uploadFailed).toEqual({ ok: false, status: 0, body: null, message: 'quota', uncertain: true });
    expect(mocks.request.mock.calls.at(-1)?.[1]).toMatchObject({ json: expect.objectContaining({ action: 'prepare' }) });
  });
});
