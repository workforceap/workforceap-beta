import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  prepareResumeUpload,
  ResumeUploadValidationError,
  type ResumeUploadFileLike,
} from './prepareResumeUpload';

function fileLike(buffer: Buffer, name: string, type: string): ResumeUploadFileLike {
  return {
    name,
    type,
    size: buffer.length,
    async arrayBuffer() {
      const copy = new Uint8Array(buffer.length);
      copy.set(buffer);
      return copy.buffer;
    },
  };
}

async function expectValidationError(
  promise: Promise<unknown>,
  code: ResumeUploadValidationError['code'],
): Promise<ResumeUploadValidationError> {
  try {
    await promise;
    assert.fail(`Expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof ResumeUploadValidationError);
    assert.equal(error.code, code);
    assert.match(error.message, /previous resume was kept/i);
    return error;
  }
}

test('prepareResumeUpload extracts a deterministic tracked real PDF', async () => {
  const pdf = await readFile(join(process.cwd(), 'WorkforceAP-Brand-Guide-2026.pdf'));
  const prepared = await prepareResumeUpload(
    fileLike(pdf, 'jordan-test-candidate-resume.pdf', 'application/pdf'),
  );

  assert.equal(prepared.extension, 'pdf');
  assert.equal(prepared.contentType, 'application/pdf');
  assert.match(prepared.text, /Workforce\s+Advancement Project/i);
  assert.doesNotMatch(prepared.text, /^%PDF|\bendobj\b|\bstream\b/);
});

test('prepareResumeUpload accepts safe UTF-8 TXT and normalizes its MIME', async () => {
  const text = Buffer.from(
    'Jordan Test Candidate\nExperience\nDatabase administrator using SQL and PostgreSQL.',
    'utf8',
  );
  const prepared = await prepareResumeUpload(fileLike(text, 'resume.txt', 'text/plain'));

  assert.equal(prepared.extension, 'txt');
  assert.equal(prepared.contentType, 'text/plain');
  assert.match(prepared.text, /Database administrator/);
});

test('prepareResumeUpload rejects near-empty text and accepts the shared 40-character boundary', async () => {
  const tooShort = Buffer.from('x'.repeat(39), 'utf8');
  const error = await expectValidationError(
    prepareResumeUpload(fileLike(tooShort, 'resume.txt', 'text/plain')),
    'resume_text_unreadable',
  );
  assert.match(error.message, /scanned or image-only/i);

  const boundary = Buffer.from('x'.repeat(40), 'utf8');
  const prepared = await prepareResumeUpload(fileLike(boundary, 'resume.txt', 'text/plain'));
  assert.equal(prepared.text.length, 40);
});

test('prepareResumeUpload rejects legacy DOC before reading file bytes', async () => {
  let readAttempted = false;
  const legacyDoc: ResumeUploadFileLike = {
    name: 'resume.doc',
    type: 'application/msword',
    size: 128,
    async arrayBuffer() {
      readAttempted = true;
      return new ArrayBuffer(0);
    },
  };

  const error = await expectValidationError(
    prepareResumeUpload(legacyDoc),
    'legacy_doc_unsupported',
  );
  assert.match(error.message, /save or export.*PDF, DOCX, or TXT/i);
  assert.equal(readAttempted, false);
});

test('prepareResumeUpload rejects a blank PDF with actionable fail-closed guidance', async () => {
  // Real, structurally complete one-page PDF with no text layer (image-only/scanned
  // resumes produce the same empty extraction contract).
  const blankPdf = Buffer.from(
    'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgKHB5cGRmKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDEKL0tpZHMgWyA0IDAgUiBdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNjEyIDc5MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDU0IDAwMDAwIG4gCjAwMDAwMDAxMTMgMDAwMDAgbiAKMDAwMDAwMDE2MiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDUKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjI1NgolJUVPRgo=',
    'base64',
  );

  const error = await expectValidationError(
    prepareResumeUpload(fileLike(blankPdf, 'scanned-resume.pdf', 'application/pdf')),
    'resume_text_unreadable',
  );
  assert.match(error.message, /scanned or image-only/i);
});

test('prepareResumeUpload rejects MIME/extension mismatch before extraction', async () => {
  const fakePdf = Buffer.from('%PDF-1.7\nnot a real resume', 'utf8');
  await expectValidationError(
    prepareResumeUpload(fileLike(fakePdf, 'resume.pdf', 'text/plain')),
    'invalid_file_type',
  );
});

test('member, admin, and counselor routes validate/extract before storage or profile mutation', async () => {
  const routePaths = [
    join(process.cwd(), 'app', 'api', 'member', 'resume', 'upload', 'route.ts'),
    join(process.cwd(), 'app', 'api', 'admin', 'members', '[id]', 'upload-resume', 'route.ts'),
    join(process.cwd(), 'app', 'api', 'counselor', 'sessions', 'upload-resume', 'route.ts'),
  ];

  for (const routePath of routePaths) {
    const source = await readFile(routePath, 'utf8');
    const preparationIndex = source.indexOf('await prepareResumeUpload(');
    const storageClientIndex = source.indexOf('getSupabaseAdmin()');
    const atomicSwapIndex = source.indexOf('await replaceClaimedResumeObjects({');

    assert.ok(preparationIndex >= 0, `${routePath}: missing shared preparation`);
    assert.ok(storageClientIndex > preparationIndex, `${routePath}: storage client created too early`);
    assert.ok(atomicSwapIndex > storageClientIndex, `${routePath}: atomic swap occurs before preparation`);
    assert.match(source, /swapProfilePaths: \(nextPaths, operationId\) => swapResumeProfilePathsWithCas\(/);
    assert.match(source, /error: error\.message, code: error\.code/);
  }
});

test('admin validates enhanced resume text before constructing storage client', async () => {
  const source = await readFile(
    join(process.cwd(), 'app', 'api', 'admin', 'members', '[id]', 'upload-resume', 'route.ts'),
    'utf8',
  );
  const sanitizeIndex = source.indexOf('sanitizeResumePlainText(enhancedText)');
  const rejectionIndex = source.indexOf('if (!hasSubstantiveResumeText(safeEnhancedText))');
  const storageClientIndex = source.indexOf('getSupabaseAdmin()');
  const enhancedStageIndex = source.indexOf("field: 'resumeEnhancedPath'");
  const atomicSwapIndex = source.indexOf('await replaceClaimedResumeObjects({');

  assert.ok(sanitizeIndex >= 0);
  assert.ok(rejectionIndex > sanitizeIndex);
  assert.ok(storageClientIndex > rejectionIndex);
  assert.ok(enhancedStageIndex > storageClientIndex);
  assert.ok(atomicSwapIndex > enhancedStageIndex);
});

test('resume coach returns the dynamic variables clamped by the ElevenLabs boundary', async () => {
  const source = await readFile(
    join(process.cwd(), 'app', 'api', 'member', 'resume-coach', 'session', 'route.ts'),
    'utf8',
  );

  // The route hands the session start to the shared member-voice helper and
  // returns only what the helper hands back.
  assert.match(source, /startMemberVoiceSessionWithLilleyFallback\(\{/);
  assert.match(source, /key: 'resume_coach'/);
  assert.match(source, /dynamicVariables: session\.dynamicVariables/);
  assert.doesNotMatch(source, /NextResponse\.json\(\{ signedUrl, expiresAt, dynamicVariables \}\)/);

  // …and the helper returns the provider-boundary-clamped set, never the raw
  // input variables.
  const helper = await readFile(join(process.cwd(), 'lib', 'ai', 'memberVoiceFallback.ts'), 'utf8');
  assert.match(helper, /dynamicVariables: primary\.dynamicVariables \?\? \{\}/);
  assert.doesNotMatch(helper, /primary\.dynamicVariables \?\? input\.dynamicVariables/);
});
