import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

test('resume AI prompts treat uploaded content as untrusted data', () => {
  for (const relativePath of [
    'app/api/member/resume/generate/route.ts',
    'app/api/admin/members/enhance-resume/route.ts',
    'app/api/admin/members/parse-resume/route.ts',
    'app/api/ai/extract-resume-skills/route.ts',
  ]) {
    const route = source(relativePath);
    assert.match(route, /untrusted data/i, relativePath);
    assert.match(route, /<resume_data>/, relativePath);
    assert.match(route, /NOT instructions/i, relativePath);
  }
});

test('AI skill extraction validates the canonical six axes and exact resume lineage', () => {
  const extraction = source('app/api/ai/extract-resume-skills/route.ts');
  const profile = source('app/api/member/skill-profile/route.ts');

  assert.match(extraction, /z\.enum\(RADAR_AXES\)/);
  assert.match(extraction, /\.length\(RADAR_AXES\.length\)/);
  assert.match(extraction, /- Service:/);
  assert.doesNotMatch(extraction, /- Ethics:/);
  assert.match(extraction, /resumeRevision: sourceResumeRevision/);
  assert.match(profile, /parsed\.resumeRevision === currentResumeRevision/);
  assert.doesNotMatch(profile, /row\.createdAt >= profile\.updatedAt/);
});

test('resume drafts are rate-limited and applications use separate immutable snapshots', () => {
  const plainText = source('app/api/member/resume/plain-text/route.ts');
  const apply = source('app/api/(portal)/dashboard/jobs/[id]/apply/route.ts');
  const storage = source('lib/resume/atomicResumeObjectSwap.ts');
  const lifecycle = source('lib/member/uploadLifecycle.ts');

  assert.match(plainText, /checkResumeDraftSaveRateLimit/);
  assert.match(apply, /storage\.copy\(currentResumePath, snapshotPath\)/);
  assert.match(apply, /resumePath: snapshotPath/);
  assert.match(apply, /withMemberUploadClaim\(\{/);
  assert.match(apply, /recordAttempt\(snapshotPath\)/);
  assert.match(lifecycle, /removeResumeObjectsWithRetry\(\{/);
  assert.match(lifecycle, /paths: attemptedPaths/);
  assert.match(storage, /retiredPaths/);
  assert.match(storage, /await cleanup\(\[\.\.\.new Set\(retiredPaths\)\]\)/);
});

test('PDF extraction runs with page, time, and worker memory bounds', () => {
  const extraction = source('lib/resume/extractTextFromResumeBuffer.ts');

  assert.match(extraction, /MAX_PDF_RESUME_PAGES = 30/);
  assert.match(extraction, /resourceLimits/);
  assert.match(extraction, /maxOldGenerationSizeMb: 128/);
  assert.match(extraction, /parsePdfInBoundedWorker/);

  // The parse must stay time-bounded. The cap was raised from 8s to 20s when
  // extraction moved to pdfjs-dist (a much larger module that loads inside the
  // worker, so a cold serverless start pays the import first). Assert a real
  // ceiling rather than one exact value, so a bound that stops bounding fails.
  const timeout = extraction.match(/PDF_PARSE_TIMEOUT_MS = ([\d_]+);/);
  assert.ok(timeout, 'PDF_PARSE_TIMEOUT_MS must be declared');
  const timeoutMs = Number(timeout[1].replaceAll('_', ''));
  assert.ok(
    timeoutMs > 0 && timeoutMs <= 30_000,
    `PDF parse timeout must stay within 30s, got ${timeoutMs}ms`,
  );
});

test('DOCX extraction streams with actual output and token caps and previews reuse it', () => {
  const extraction = source('lib/resume/extractTextFromResumeBuffer.ts');
  assert.match(extraction, /createInflateRaw/);
  assert.match(extraction, /MAX_DOCX_DOCUMENT_XML_BYTES/);
  assert.match(extraction, /MAX_DOCX_XML_TOKENS/);
  assert.doesNotMatch(extraction, /mammoth\.extractRawText/);

  for (const route of [
    'app/api/member/resume/docx-html/route.ts',
    'app/api/counselor/members/[memberId]/resume/docx-html/route.ts',
  ]) {
    const content = source(route);
    assert.match(content, /extractTextFromResumeBuffer/);
    assert.doesNotMatch(content, /mammoth/);
  }
});
