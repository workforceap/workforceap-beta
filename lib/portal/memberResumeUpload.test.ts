import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getResumeUploadFileError,
  RESUME_UPLOAD_ACCEPT,
  RESUME_UPLOAD_FORMAT_LABEL,
  uploadMemberResumeFile,
} from './memberResumeUpload';

function fakeFile(name: string, size = 1024): File {
  return { name, size } as File;
}

test('resume upload UI contract advertises only extractable formats', () => {
  assert.equal(RESUME_UPLOAD_ACCEPT, '.pdf,.docx,.txt');
  assert.equal(RESUME_UPLOAD_FORMAT_LABEL, 'PDF, DOCX, or TXT');
  assert.equal(getResumeUploadFileError(fakeFile('resume.pdf')), null);
  assert.equal(getResumeUploadFileError(fakeFile('resume.DOCX')), null);
  assert.equal(getResumeUploadFileError(fakeFile('resume.txt')), null);
});

test('legacy DOC files fail client-side with conversion guidance', () => {
  assert.match(getResumeUploadFileError(fakeFile('resume.doc')) ?? '', /Legacy \.doc files are not supported/i);
  assert.match(getResumeUploadFileError(fakeFile('resume.doc')) ?? '', /PDF, DOCX, or TXT/i);
});

test('member upload returns the server extraction warning to the UI', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    extractionWarning: 'Headings may have been flattened.',
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const result = await uploadMemberResumeFile(fakeFile('resume.txt'));
    assert.deepEqual(result, { ok: true, warning: 'Headings may have been flattened.' });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a 5xx answer with a non-JSON body becomes a plain-language error, not an unchanged page', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>500</title>', {
    status: 500,
    statusText: 'Internal Server Error',
    headers: { 'content-type': 'text/html' },
  });

  try {
    const result = await uploadMemberResumeFile(fakeFile('resume.txt'));
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.error, /temporarily unavailable/i);
    assert.doesNotMatch(result.ok ? '' : result.error, /500|Internal Server Error/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a 4xx validation answer keeps the server sentence and a network failure names the connection', async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Provide a file' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
    assert.deepEqual(await uploadMemberResumeFile(fakeFile('resume.txt')), { ok: false, error: 'Provide a file' });

    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const offline = await uploadMemberResumeFile(fakeFile('resume.txt'));
    assert.equal(offline.ok, false);
    assert.match(offline.ok ? '' : offline.error, /could not reach/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
