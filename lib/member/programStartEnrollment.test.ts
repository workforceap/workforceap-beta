import assert from 'node:assert/strict';
import test from 'node:test';

import { DIGITAL_LITERACY_PROGRAM_SLUG } from '@/shared/digitalLiteracyPathway';
import type { DashboardEnrollment } from './resolveActiveDashboardProgram';
import {
  programStartAccessFromDashboardView,
  resolveProgramStartAccess,
} from './programStartEnrollment';

function enrollment(
  slug: string,
  opts: { isPrimary?: boolean; id?: string } = {},
): DashboardEnrollment {
  return {
    id: opts.id ?? `enr-${slug}`,
    programSlug: slug,
    isPrimary: opts.isPrimary ?? false,
    enrolledAt: new Date('2026-04-01T00:00:00Z'),
  };
}

test('CourseEnrollment row + enrolledProgram NULL does not bounce start', () => {
  const access = resolveProgramStartAccess({
    enrollments: [enrollment(DIGITAL_LITERACY_PROGRAM_SLUG, { isPrimary: true })],
    legacyEnrolledProgram: null,
  });
  assert.equal(access.bounceToProgram, false);
  assert.equal(access.enrolledSlug, DIGITAL_LITERACY_PROGRAM_SLUG);
});

test('unassigned members still bounce to My Program', () => {
  const access = resolveProgramStartAccess({
    enrollments: [],
    legacyEnrolledProgram: null,
  });
  assert.equal(access.bounceToProgram, true);
  assert.equal(access.enrolledSlug, null);
});

test('non-primary history rows with null User.enrolledProgram still bounce', () => {
  const access = resolveProgramStartAccess({
    enrollments: [enrollment(DIGITAL_LITERACY_PROGRAM_SLUG)],
    legacyEnrolledProgram: null,
  });
  assert.equal(access.bounceToProgram, true);
  assert.equal(access.enrolledSlug, null);
});

test('legacy User.enrolledProgram still admits members with no CourseEnrollment row', () => {
  const access = resolveProgramStartAccess({
    enrollments: [],
    legacyEnrolledProgram: DIGITAL_LITERACY_PROGRAM_SLUG,
  });
  assert.equal(access.bounceToProgram, false);
  assert.equal(access.enrolledSlug, DIGITAL_LITERACY_PROGRAM_SLUG);
});

test('dashboard view with an active slug does not bounce start', () => {
  const access = programStartAccessFromDashboardView({
    activeProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG,
  });
  assert.equal(access.bounceToProgram, false);
  assert.equal(access.enrolledSlug, DIGITAL_LITERACY_PROGRAM_SLUG);
});

// The /dashboard/program/start page gating on the live dashboard enrollment
// source is exercised in tests/app/program-start-page.spec.tsx.
