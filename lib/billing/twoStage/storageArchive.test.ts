import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  archiveFinancePdf,
  FinanceArchiveError,
  FINANCE_ARCHIVE_MAX_BYTES,
  readFinanceArchivePdf,
  type FinanceArchiveRef,
} from './storageArchive';

type Admin = ReturnType<typeof getSupabaseAdmin>;
const CASE_ID = 'case-123';
const PDF = new TextEncoder().encode('%PDF-1.7\nexample billing PDF bytes');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fakeStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const calls = { buckets: 0, uploads: [] as Array<{ key: string; options: unknown; bytes: Uint8Array }> };
  let publicBucket = false;
  let uploadFailure: 'before' | 'after' | null = null;
  let infoOverride: Partial<{ name: string; bucketId: string; size: number; contentType: string }> = {};

  const bucket = {
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
