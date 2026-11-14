import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  adoptFinanceArchiveDirectUpload,
  archiveFinancePdf,
  FinanceArchiveError,
  FINANCE_ARCHIVE_MAX_BYTES,
  prepareFinanceArchiveDirectUpload,
  readFinanceArchivePdf,
  type FinanceArchiveRef,
} from './storageArchive';

type Admin = ReturnType<typeof getSupabaseAdmin>;
const CASE_ID = 'case-123';
const PDF = new TextEncoder().encode('%PDF-1.7\nexample billing PDF bytes');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fakeStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const calls = {
    buckets: 0,
    uploads: [] as Array<{ key: string; options: unknown; bytes: Uint8Array }>,
    signedUploads: [] as string[],
  };
  let publicBucket = false;
  let uploadFailure: 'before' | 'after' | null = null;
  let infoOverride: Partial<{ name: string; bucketId: string; size: number; contentType: string }> = {};
  let signedUpload: { token?: string; path?: string; error?: { message: string } | null } = {};

  const bucket = {
    createSignedUploadUrl: async (key: string) => {
      calls.signedUploads.push(key);
      if (signedUpload.error) return { data: null, error: signedUpload.error };
      return { data: { path: signedUpload.path ?? key, token: signedUpload.token ?? 'tok' }, error: null };
    },
    upload: async (key: string, bytes: Uint8Array, options: { upsert: boolean; contentType: string }) => {
      calls.uploads.push({ key, options, bytes: Uint8Array.from(bytes) });
      if (uploadFailure === 'before' || objects.has(key)) return { data: null, error: { message: 'upload failed' } };
      objects.set(key, { bytes: Uint8Array.from(bytes), contentType: options.contentType });
      if (uploadFailure === 'after') return { data: null, error: { message: 'response lost' } };
      return { data: { path: key }, error: null };
    },
    info: async (key: string) => {
      const object = objects.get(key);
      if (!object) return { data: null, error: { message: 'not found' } };
      return {
        data: {
          name: key,
          bucketId: 'billing-finance',
          size: object.bytes.byteLength,
          contentType: object.contentType,
          ...infoOverride,
        },
        error: null,
      };
    },
    download: async (key: string) => {
      const object = objects.get(key);
      if (!object) return { data: null, error: { message: 'not found' } };
      return { data: new Blob([Uint8Array.from(object.bytes)], { type: object.contentType }), error: null };
    },
  };
  const admin = {
    storage: {
      getBucket: async (_id: string) => {
        calls.buckets += 1;
        return { data: { id: 'billing-finance', name: 'billing-finance', public: publicBucket }, error: null };
      },
      from: (_id: string) => bucket,
    },
  } as unknown as Admin;
  return {
    admin, objects, calls,
    setPublic: (value: boolean) => { publicBucket = value; },
    setUploadFailure: (value: 'before' | 'after' | null) => { uploadFailure = value; },
    setInfoOverride: (value: typeof infoOverride) => { infoOverride = value; },
    setSignedUpload: (value: typeof signedUpload) => { signedUpload = value; },
  };
}

function assertCode(code: FinanceArchiveError['code']) {
  return (error: unknown) => error instanceof FinanceArchiveError && error.code === code;
}

describe('billing finance Storage archive', () => {
  it('stores exact immutable PDF bytes under the M1 content-addressed key and verifies readback', async () => {
    const storage = fakeStorage();
    const callerBytes = Uint8Array.from(PDF);
    const pending = archiveFinancePdf({ caseId: CASE_ID, kind: 'j5_signed_pdf', bytes: callerBytes }, { admin: storage.admin });
    callerBytes.fill(0); // The asynchronous Storage calls must not observe caller mutation.
    const result = await pending;

    assert.equal(result.reused, false);
    assert.deepEqual(result.ref, {
      caseId: CASE_ID,
      kind: 'j5_signed_pdf',
      bucket: 'billing-finance',
      key: `cases/${CASE_ID}/j5/${hash(PDF)}.pdf`,
      sha256: hash(PDF),
      byteLength: PDF.byteLength,
      mimeType: 'application/pdf',
    });
    assert.deepEqual(storage.calls.uploads[0].options, { contentType: 'application/pdf', upsert: false });
    assert.deepEqual(storage.calls.uploads[0].bytes, PDF);
    assert.deepEqual(await readFinanceArchivePdf(result.ref, { admin: storage.admin }), PDF);
  });

  it('reuses a matching object on duplicate or lost upload response without overwrite or delete', async () => {
    const storage = fakeStorage();
    const input = { caseId: CASE_ID, kind: 'board_signed_voucher' as const, bytes: PDF };
    const first = await archiveFinancePdf(input, { admin: storage.admin });
    const retry = await archiveFinancePdf(input, { admin: storage.admin });
    assert.equal(first.reused, false);
    assert.equal(retry.reused, true);
    assert.deepEqual(retry.ref, first.ref);
    assert.equal(storage.objects.size, 1);
    assert.ok(storage.calls.uploads.every((call) => (call.options as { upsert: boolean }).upsert === false));

    const uncertain = fakeStorage();
    uncertain.setUploadFailure('after');
    const afterLostResponse = await archiveFinancePdf(input, { admin: uncertain.admin });
    assert.equal(afterLostResponse.reused, true);
    assert.deepEqual(uncertain.objects.get(afterLostResponse.ref.key)?.bytes, PDF);
  });

  it('holds a retry when the existing object has different bytes', async () => {
    const storage = fakeStorage();
    const key = `cases/${CASE_ID}/voucher/${hash(PDF)}.pdf`;
    const wrong = Uint8Array.from(PDF);
    wrong[wrong.length - 1] ^= 1;
    storage.objects.set(key, { bytes: wrong, contentType: 'application/pdf' });
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'board_signed_voucher', bytes: PDF }, { admin: storage.admin }),
      assertCode('INTEGRITY_MISMATCH'),
    );
    assert.deepEqual(storage.objects.get(key)?.bytes, wrong);
  });

  it('fails closed before I/O for a public bucket, unsafe bucket setting, non-PDF or oversized input', async () => {
    const storage = fakeStorage();
    storage.setPublic(true);
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: PDF }, { admin: storage.admin }),
      assertCode('STORAGE_UNAVAILABLE'),
    );
    assert.equal(storage.calls.uploads.length, 0);

    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: PDF }, {
        admin: storage.admin, env: { BILLING_FINANCE_BUCKET: 'member-files' },
      }),
      assertCode('STORAGE_UNAVAILABLE'),
    );
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: PDF }, {
        admin: storage.admin, env: { BILLING_FINANCE_BUCKET: 'another-private-bucket' },
      }),
      assertCode('STORAGE_UNAVAILABLE'),
    );
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: new TextEncoder().encode('<html>') }, { admin: storage.admin }),
      assertCode('INVALID_INPUT'),
    );
    const oversized = new Uint8Array(FINANCE_ARCHIVE_MAX_BYTES + 1);
    oversized.set(PDF.subarray(0, 5));
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: oversized }, { admin: storage.admin }),
      assertCode('INVALID_INPUT'),
    );
    assert.equal(storage.calls.uploads.length, 0);
  });

  it('checks the immutable reference, metadata, and downloaded hash before returning any bytes', async () => {
    const storage = fakeStorage();
    const { ref } = await archiveFinancePdf({ caseId: CASE_ID, kind: 'j6_signed_pdf', bytes: PDF }, { admin: storage.admin });
    await assert.rejects(
      readFinanceArchivePdf({ ...ref, key: 'members/user-123/private.pdf' }, { admin: storage.admin }),
      assertCode('INVALID_REFERENCE'),
    );
    await assert.rejects(
      readFinanceArchivePdf({ ...ref, bucket: 'member-files' }, { admin: storage.admin }),
      assertCode('INVALID_REFERENCE'),
    );

    storage.setInfoOverride({ contentType: 'text/html' });
    await assert.rejects(readFinanceArchivePdf(ref, { admin: storage.admin }), assertCode('INTEGRITY_MISMATCH'));
    storage.setInfoOverride({ size: ref.byteLength - 1 });
    await assert.rejects(readFinanceArchivePdf(ref, { admin: storage.admin }), assertCode('INTEGRITY_MISMATCH'));
    storage.setInfoOverride({});
    const wrong = Uint8Array.from(PDF);
    wrong[wrong.length - 1] ^= 1;
    storage.objects.set(ref.key, { bytes: wrong, contentType: 'application/pdf' });
    await assert.rejects(readFinanceArchivePdf(ref, { admin: storage.admin }), assertCode('INTEGRITY_MISMATCH'));
  });

  it('does not claim an upload succeeded when Storage has no matching object', async () => {
    const storage = fakeStorage();
    storage.setUploadFailure('before');
    await assert.rejects(
      archiveFinancePdf({ caseId: CASE_ID, kind: 'external_j5_copy', bytes: PDF }, { admin: storage.admin }),
      assertCode('STORAGE_UNAVAILABLE'),
    );
    assert.equal(storage.objects.size, 0);
  });
});

describe('billing finance direct-to-storage voucher upload', () => {
  const sha = hash(PDF);
  const key = `cases/${CASE_ID}/voucher/${sha}.pdf`;
  const byteLength = 6 * 1024 * 1024;

  it('issues a signed upload URL for a content-addressed voucher key and refuses unsafe input first', async () => {
    const storage = fakeStorage();
    const prepared = await prepareFinanceArchiveDirectUpload(
      { caseId: CASE_ID, kind: 'board_signed_voucher', sha256: sha, byteLength },
      { admin: storage.admin },
    );
    assert.deepEqual(prepared.ref, {
      caseId: CASE_ID,
      kind: 'board_signed_voucher',
      bucket: 'billing-finance',
      key,
      sha256: sha,
      byteLength,
      mimeType: 'application/pdf',
    });
    assert.equal(prepared.token, 'tok');
    assert.equal(prepared.path, key);
    assert.equal(prepared.maxBytes, FINANCE_ARCHIVE_MAX_BYTES);
    assert.deepEqual(storage.calls.signedUploads, [key]);
    assert.equal(storage.calls.uploads.length, 0);

    await assert.rejects(
      prepareFinanceArchiveDirectUpload(
        { caseId: CASE_ID, kind: 'board_signed_voucher', sha256: 'zz', byteLength },
        { admin: storage.admin },
      ),
      assertCode('INVALID_INPUT'),
    );
    await assert.rejects(
      prepareFinanceArchiveDirectUpload(
        { caseId: CASE_ID, kind: 'board_signed_voucher', sha256: sha, byteLength: FINANCE_ARCHIVE_MAX_BYTES + 1 },
        { admin: storage.admin },
      ),
      assertCode('INVALID_INPUT'),
    );
    await assert.rejects(
      prepareFinanceArchiveDirectUpload(
        { caseId: '../escape', kind: 'board_signed_voucher', sha256: sha, byteLength },
        { admin: storage.admin },
      ),
      assertCode('INVALID_INPUT'),
    );
    assert.equal(storage.calls.signedUploads.length, 1);
  });

  it('fails closed before minting a URL when the bucket is public or Storage returns no token', async () => {
    const publicBucket = fakeStorage();
    publicBucket.setPublic(true);
    await assert.rejects(
      prepareFinanceArchiveDirectUpload(
        { caseId: CASE_ID, kind: 'board_signed_voucher', sha256: sha, byteLength },
        { admin: publicBucket.admin },
      ),
      assertCode('STORAGE_UNAVAILABLE'),
    );
    assert.equal(publicBucket.calls.signedUploads.length, 0);

    const missingToken = fakeStorage();
    missingToken.setSignedUpload({ token: undefined, error: { message: 'no token' } });
    await assert.rejects(
      prepareFinanceArchiveDirectUpload(
        { caseId: CASE_ID, kind: 'board_signed_voucher', sha256: sha, byteLength },
        { admin: missingToken.admin },
      ),
      assertCode('STORAGE_UNAVAILABLE'),
    );
  });

  it('adopts only after Storage metadata and downloaded bytes match the claimed hash', async () => {
    const storage = fakeStorage();
    const ref: FinanceArchiveRef = {
      caseId: CASE_ID,
      kind: 'board_signed_voucher',
      bucket: 'billing-finance',
      key,
      sha256: sha,
      byteLength: PDF.byteLength,
      mimeType: 'application/pdf',
    };
    await assert.rejects(adoptFinanceArchiveDirectUpload(ref, { admin: storage.admin }), assertCode('INVALID_INPUT'));

    storage.objects.set(key, { bytes: PDF, contentType: 'application/pdf' });
    const adopted = await adoptFinanceArchiveDirectUpload(ref, { admin: storage.admin });
    assert.equal(adopted.reused, false);
    assert.deepEqual(adopted.ref, ref);

    const wrong = Uint8Array.from(PDF);
    wrong[wrong.length - 1] ^= 1;
    storage.objects.set(key, { bytes: wrong, contentType: 'application/pdf' });
    await assert.rejects(adoptFinanceArchiveDirectUpload(ref, { admin: storage.admin }), assertCode('INTEGRITY_MISMATCH'));
  });
});
