import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { inspectStoredEnhancedResume } from './inspectStoredEnhancedResume';

test('a substantive stored text draft remains available for inline preview', async () => {
  const text = 'Jordan Candidate\nExperience\nManaged warehouse inventory and trained new staff.';
  assert.deepEqual(
    await inspectStoredEnhancedResume(Buffer.from(text), 'member-1/resume-enhanced.txt'),
    { readable: true, text },
  );
});

test('legacy extraction-failure prose is quarantined without deleting the object', async () => {
  const failedDraft = 'Given the provided information, the "base resume to improve" is a raw PDF stream that cannot be parsed for text content. The enhanced resume will use contact information only.';
  assert.deepEqual(
    await inspectStoredEnhancedResume(Buffer.from(failedDraft), 'member-1/resume-enhanced.txt'),
    { readable: false, text: null },
  );
});

test('binary bytes, unknown formats, and unreadable text are never exposed as enhanced resumes', async () => {
  const rawPdf = Buffer.from('%PDF-1.7\n1 0 obj\nstream\nnot a real PDF\nendstream\nendobj');
  const invalidUtf8 = Buffer.from([0xff, 0xfe, 0xfd]);
  for (const [bytes, path] of [
    [rawPdf, 'member-1/resume-enhanced.txt'],
    [rawPdf, 'member-1/resume-enhanced.pdf'],
    [invalidUtf8, 'member-1/resume-enhanced.txt'],
    [Buffer.from('Legacy document'), 'member-1/resume-enhanced.doc'],
  ] as const) {
    assert.deepEqual(await inspectStoredEnhancedResume(bytes, path), { readable: false, text: null });
  }
});
