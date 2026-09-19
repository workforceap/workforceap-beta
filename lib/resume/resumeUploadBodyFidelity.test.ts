import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import test from 'node:test';
import {
  replaceResumeObjectsAtomically,
  type ResumeObjectUpload,
} from './atomicResumeObjectSwap';
import { prepareResumeUpload, type ResumeUploadFileLike } from './prepareResumeUpload';

/**
 * Byte fidelity between the resume bytes that pass validation and the bytes
 * that reach Supabase Storage.
 *
 * `prepareResumeUpload` validates magic bytes and extracts text from one byte
 * range, and the routes upload another handle to the same bytes. Nothing used
 * to prove those two agree, or that a staged object is non-empty at all. These
 * suites pin both, plus the boundary property that makes the representation
 * safe: a byte view transmits exactly the bytes it describes, where a bare
 * `ArrayBuffer` surrenders a whole backing store.
 */

/** Mirrors `File.arrayBuffer()`: an exact, standalone ArrayBuffer. */
function fileLike(bytes: Buffer, name: string, type: string): ResumeUploadFileLike {
  return {
    name,
    type,
    size: bytes.length,
    async arrayBuffer() {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer;
    },
  };
}

/** A real DEFLATE-compressed DOCX carrying enough text to clear the substance gate. */
async function docxFixture(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

const RESUME_TEXT =
  'Jordan Test Candidate\nExperience\nDatabase administrator using SQL and PostgreSQL.';

async function resumeFixtures(): Promise<Array<{
  label: string;
  bytes: Buffer;
  name: string;
  type: string;
}>> {
  return [
    {
      label: 'txt',
      bytes: Buffer.from(RESUME_TEXT, 'utf8'),
      name: 'resume.txt',
      type: 'text/plain',
    },
    {
      label: 'docx',
      bytes: await docxFixture(RESUME_TEXT.replace(/\n/g, ' ')),
      name: 'resume.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    {
      label: 'pdf',
      // Tracked, deterministic, text-bearing PDF (same fixture the preparation
      // suite extracts from).
      bytes: await readFile(join(process.cwd(), 'WorkforceAP-Brand-Guide-2026.pdf')),
      name: 'resume.pdf',
      type: 'application/pdf',
    },
  ];
}

test('prepared resume bytes are non-empty and byte-identical to the validated file', async () => {
  for (const fixture of await resumeFixtures()) {
    const prepared = await prepareResumeUpload(
      fileLike(fixture.bytes, fixture.name, fixture.type),
    );

    assert.ok(fixture.bytes.length > 0, `${fixture.label}: fixture is empty`);
    assert.ok(prepared.bytes.byteLength > 0, `${fixture.label}: staged an empty body`);
    assert.equal(
      prepared.bytes.byteLength,
      fixture.bytes.length,
      `${fixture.label}: body length drifted from the validated input`,
    );
    assert.ok(
      Buffer.from(prepared.bytes).equals(fixture.bytes),
      `${fixture.label}: body bytes drifted from the validated input`,
    );
  }
});

test('prepared resume bytes span their whole backing store, so a .buffer read cannot over-read', async () => {
  for (const fixture of await resumeFixtures()) {
    const prepared = await prepareResumeUpload(
      fileLike(fixture.bytes, fixture.name, fixture.type),
    );

    assert.equal(prepared.bytes.byteOffset, 0, `${fixture.label}: view is offset into a larger store`);
    assert.equal(
      prepared.bytes.byteLength,
      prepared.bytes.buffer.byteLength,
      `${fixture.label}: backing store is larger than the validated bytes`,
    );
  }
});

test('extraction does not detach or mutate the bytes that get uploaded', async () => {
  // pdf.js parses inside a worker. Were those bytes transferred rather than
  // cloned, the parent's view would come back detached and stage zero bytes.
  const pdf = await readFile(join(process.cwd(), 'WorkforceAP-Brand-Guide-2026.pdf'));
  const prepared = await prepareResumeUpload(fileLike(pdf, 'resume.pdf', 'application/pdf'));

  assert.ok(prepared.text.length > 0, 'extraction produced no text');
  assert.equal(prepared.bytes.buffer.byteLength, pdf.length, 'backing store was detached');
  assert.ok(Buffer.from(prepared.bytes).equals(pdf), 'extraction mutated the upload bytes');
});

test('a body view inside a larger allocation stages only its own bytes', async () => {
  // Models a pooled Node Buffer: Buffer.from(bytes) for a small payload returns
  // a view at a non-zero offset into a shared 8 KiB pool. Handing such a view's
  // `.buffer` to storage uploads the whole pool — unrelated adjacent heap
  // memory — so the boundary takes the view itself.
  const pool = new Uint8Array(4096).fill(0xab);
  const payload = Buffer.from('%PDF-1.7 resume payload bytes', 'utf8');
  pool.set(payload, 512);
  const body = pool.subarray(512, 512 + payload.length);

  assert.equal(body.byteOffset, 512, 'fixture should sit at a non-zero offset');
  assert.ok(body.buffer.byteLength > body.byteLength, 'fixture should share a larger store');

  const staged: Array<ResumeObjectUpload['body']> = [];
  await replaceResumeObjectsAtomically({
    userId: 'member-pooled',
    uploads: [{
      field: 'resumeOriginalPath',
      extension: 'pdf',
      contentType: 'application/pdf',
      body,
    }],
    makeVersionId: () => 'pooled-v1',
    uploadObject: async (_path, uploadBody) => {
      staged.push(uploadBody);
      return { error: null };
    },
    removeObjects: async () => ({ error: null }),
    swapProfilePaths: async () => ({}),
  });

  assert.equal(staged.length, 1);
  const stagedBody = staged[0];
  assert.ok(stagedBody instanceof Uint8Array, 'binary body should stay a byte view');
  assert.equal(stagedBody.byteLength, payload.length, 'staged the backing store, not the view');
  assert.ok(Buffer.from(stagedBody).equals(payload), 'staged bytes drifted from the payload');
});

test('the storage boundary rejects a bare ArrayBuffer body at the type level', () => {
  const upload: ResumeObjectUpload = {
    field: 'resumeOriginalPath',
    extension: 'pdf',
    contentType: 'application/pdf',
    // @ts-expect-error A bare ArrayBuffer surrenders a whole backing store, so
    // the boundary accepts only a byte view or text. If this ever compiles, the
    // unsafe representation is reachable again.
    body: new ArrayBuffer(8),
  };

  assert.ok(upload.body, 'fixture should construct at runtime');
});

test('prepared bytes reach storage unchanged while prior profile objects are retired', async () => {
  const resume = Buffer.from(RESUME_TEXT, 'utf8');
  const prepared = await prepareResumeUpload(fileLike(resume, 'resume.txt', 'text/plain'));

  const staged: Array<{ path: string; body: ResumeObjectUpload['body'] }> = [];
  const removed: string[][] = [];

  const result = await replaceResumeObjectsAtomically({
    userId: 'member-e2e',
    uploads: [{
      field: 'resumeOriginalPath',
      extension: prepared.extension,
      contentType: prepared.contentType,
      body: prepared.bytes,
    }],
    clearFields: ['resumeEnhancedPath'],
    makeVersionId: () => 'e2e-v1',
    uploadObject: async (path, body) => {
      staged.push({ path, body });
      return { error: null };
    },
    removeObjects: async (paths) => {
      removed.push(paths);
      return { error: null };
    },
    swapProfilePaths: async () => ({
      resumeOriginalPath: 'member-e2e/resume-original-prior.pdf',
      resumeEnhancedPath: 'member-e2e/resume-enhanced-prior.txt',
    }),
  });

  assert.equal(staged.length, 1);
  assert.equal(staged[0].path, 'member-e2e/resume-original-e2e-v1.txt');
  const stagedBody = staged[0].body;
  assert.ok(stagedBody instanceof Uint8Array, 'binary body should stay a byte view');
  assert.ok(Buffer.from(stagedBody).equals(resume), 'staged bytes drifted from the validated input');

  assert.equal(result.paths.resumeOriginalPath, 'member-e2e/resume-original-e2e-v1.txt');
  assert.equal(result.paths.resumeEnhancedPath, null);
  assert.equal(result.previousPaths.resumeOriginalPath, 'member-e2e/resume-original-prior.pdf');

  // Both replaced objects are retired exactly once, and the freshly staged
  // object is never among them.
  assert.equal(removed.length, 1);
  assert.deepEqual([...removed[0]].sort(), [
    'member-e2e/resume-enhanced-prior.txt',
    'member-e2e/resume-original-prior.pdf',
  ]);
});
