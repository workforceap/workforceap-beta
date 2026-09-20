import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_TRAINING_STUB_HREF,
  MEMBER_PROGRAM_HREF,
  resolveMemberProgramHref,
} from './memberProgramHref';

test('resolveMemberProgramHref sends the dead training stub to My Program', () => {
  assert.equal(resolveMemberProgramHref(LEGACY_TRAINING_STUB_HREF), MEMBER_PROGRAM_HREF);
  assert.equal(resolveMemberProgramHref('/dashboard/training'), '/dashboard/program');
  assert.equal(resolveMemberProgramHref(null), '/dashboard/program');
  assert.equal(resolveMemberProgramHref(undefined), '/dashboard/program');
  assert.equal(resolveMemberProgramHref(''), '/dashboard/program');
});

test('resolveMemberProgramHref preserves ?program= and ?error= on the rewrite', () => {
  assert.equal(
    resolveMemberProgramHref('/dashboard/training?program=google-it-support'),
    '/dashboard/program?program=google-it-support',
  );
  assert.equal(
    resolveMemberProgramHref('/dashboard/training?error=launch_failed'),
    '/dashboard/program?error=launch_failed',
  );
});

test('resolveMemberProgramHref leaves real destinations alone', () => {
  assert.equal(resolveMemberProgramHref('/dashboard/program'), '/dashboard/program');
  assert.equal(resolveMemberProgramHref('/dashboard/learning'), '/dashboard/learning');
  assert.equal(
    resolveMemberProgramHref('/dashboard/program?program=google-it-support'),
    '/dashboard/program?program=google-it-support',
  );
});

// The rendered CTAs (MemberHomeKit resume module, MemberDoThisNextCard) are
// exercised in components/portal/kit/pages/member/MemberHomeKit.test.tsx and
// components/portal/MemberDoThisNextCard.test.tsx.
