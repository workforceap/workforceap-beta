import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowResumeUploadHint } from './resumeUploadHint';

test('shows the resume hint on home and resume-consuming tools', () => {
  for (const path of [
    '/dashboard',
    '/dashboard/',
    '/es/dashboard',
    '/dashboard/ai-tools',
    '/dashboard/ai-tools/resume-studio?view=rewrite',
    '/dashboard/coach',
    '/dashboard/jobs/123',
    '/dashboard/resume',
  ]) {
    assert.equal(shouldShowResumeUploadHint(path), true, path);
  }
});

test('hides the resume hint where a resume is irrelevant', () => {
  for (const path of [
    '/dashboard/messages',
    '/dashboard/profile',
    '/dashboard/learning/wioa-qualification',
    '/dashboard/program',
    '/dashboard/certifications',
    '/fr/dashboard/messages',
    '',
    null,
  ]) {
    assert.equal(shouldShowResumeUploadHint(path), false, String(path));
  }
});
