import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADMIN_SSR_LIST_CAP,
  ANALYTICS_SAMPLE_CAP,
  COUNSELOR_ROSTER_CAP,
  EMPLOYER_LIST_CAP,
  LOOKUP_LIST_CAP,
  MEMBER_HISTORY_CAP,
  UNBOUNDED_LIST_TAKE_FLOOR,
  WIOA_DEMOGRAPHICS_CAP,
  clampTake,
  isListTruncated,
  showingFirstLabel,
} from './queryCaps';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('remaining-surface caps stay below the old silent 5k floor', () => {
  assert.ok(ADMIN_SSR_LIST_CAP <= 500);
  assert.ok(EMPLOYER_LIST_CAP <= 500);
  assert.ok(COUNSELOR_ROSTER_CAP <= 500);
  assert.ok(MEMBER_HISTORY_CAP <= 500);
  assert.ok(LOOKUP_LIST_CAP <= 500);
  assert.ok(WIOA_DEMOGRAPHICS_CAP <= 500);
  assert.ok(ANALYTICS_SAMPLE_CAP <= 500);
  assert.ok(ADMIN_SSR_LIST_CAP < UNBOUNDED_LIST_TAKE_FLOOR);
  assert.ok(COUNSELOR_ROSTER_CAP < UNBOUNDED_LIST_TAKE_FLOOR);
  assert.ok(WIOA_DEMOGRAPHICS_CAP < UNBOUNDED_LIST_TAKE_FLOOR);
});

test('clampTake and showingFirstLabel', () => {
  assert.equal(clampTake(9999, 200), 200);
  assert.equal(clampTake(0, 200), 1);
  assert.equal(showingFirstLabel(200, 200, 'members'), 'Showing 200 members');
  assert.equal(showingFirstLabel(200, 812, 'members'), 'Showing first 200 of 812 members');
  assert.equal(isListTruncated(200, 200, 812), true);
  assert.equal(isListTruncated(40, 200, 40), false);
});

const PORTAL_AND_ADMIN_SSR = [
  'app/(portal)/employer/candidates/[studentId]/page.tsx',
  'app/(portal)/counselor/page.tsx',
  'app/(portal)/counselor/students/[memberId]/page.tsx',
  'app/(portal)/partner/page.tsx',
  'app/admin/members/new/page.tsx',
  'app/admin/members/[id]/page.tsx',
  'app/admin/members/job-ready/page.tsx',
  'app/admin/members/interview-ready/page.tsx',
  'app/admin/program-change-requests/page.tsx',
  'app/admin/students/page.tsx',
  'app/admin/training-progress/page.tsx',
  'app/admin/subgroups/legacy.tsx',
  'app/admin/subgroups/new/page.tsx',
  'app/admin/subgroups/[id]/edit/page.tsx',
  'app/admin/wioa-screening/page.tsx',
  'app/admin/users/deleted/page.tsx',
  'app/admin/programs/page.tsx',
  'app/admin/invites/new/page.tsx',
  'app/admin/partners/page.tsx',
  'app/admin/partners/[id]/page.tsx',
  'app/admin/mentors/page.tsx',
  'app/admin/blog/page.tsx',
  'app/admin/growth/page.tsx',
  'app/admin/analytics/page.tsx',
  'app/admin/coursera/learners/[userId]/page.tsx',
  'app/admin/coursera/page.tsx',
  'app/api/admin/reports/wioa/route.ts',
];

// workQueue / triageFlags / priorityQueue / inboxZero no longer query on
// their own: they project the shared attention queue, whose roster lookup
// lives in lib/attention/counselor.ts.
const COUNSELOR_HELPERS = [
  'lib/attention/counselor.ts',
  'lib/counselor/counselorStudentsRoster.ts',
  'lib/counselor/commandCenter.ts',
];

test('leftover SSR pages no longer use silent 5k/10k/20k takes', () => {
  for (const rel of PORTAL_AND_ADMIN_SSR) {
    const src = readRepo(rel);
    assert.doesNotMatch(src, /take:\s*(5000|10000|20000)/, rel);
  }
});

test('counselor helpers no longer use silent 5k takes', () => {
  for (const rel of COUNSELOR_HELPERS) {
    const src = readRepo(rel);
    assert.doesNotMatch(src, /take:\s*5000/, rel);
    assert.match(src, /COUNSELOR_ROSTER_CAP/, rel);
  }
});

test('employer candidate page and WIOA report use named caps', () => {
  const candidate = readRepo('app/(portal)/employer/candidates/[studentId]/page.tsx');
  assert.match(candidate, /EMPLOYER_LIST_CAP/);
  const wioa = readRepo('app/api/admin/reports/wioa/route.ts');
  assert.match(wioa, /WIOA_DEMOGRAPHICS_CAP/);
});
