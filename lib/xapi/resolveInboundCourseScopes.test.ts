import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APPROVED_CURRICULUM_VERSION,
  LEGACY_CURRICULUM_VERSION,
} from '@/lib/content/programCurriculumManifest';
import { resolveInboundCourseScopes } from './resolveInboundCourseScopes';
import { selectCurriculumMappingTargets } from '@/lib/member/curriculumAssignment';
import { emptyCurriculumMappingIndex, resolveProviderCourseMappings } from '@/lib/coursera/curriculumMapping';
import { emptyCanonicalMappingIndex } from '@/lib/coursera/canonicalMapping';

describe('inbound provider course scopes', () => {
  it('routes an exact provider id to a secondary assigned curriculum', async () => {
    const scopes = await resolveInboundCourseScopes(
      {
        courseraCourseId: 'provider-course',
        assignments: [
          { programSlug: 'primary-program', curriculumVersion: LEGACY_CURRICULUM_VERSION },
          { programSlug: 'secondary-program', curriculumVersion: APPROVED_CURRICULUM_VERSION },
        ],
        fallbackProgramSlug: 'primary-program',
        fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
      },
      async () => ({
        status: 'matched_assignment',
        targets: [{
          courseraCourseId: 'provider-course',
          programSlug: 'secondary-program',
          curriculumVersion: APPROVED_CURRICULUM_VERSION,
          courseSlug: 'secondary-course',
        }],
      }),
    );
    assert.deepEqual(scopes, [{
      programSlug: 'secondary-program',
      curriculumVersion: APPROVED_CURRICULUM_VERSION,
      assignmentMatched: true,
    }]);
  });

  it('fans a shared id into every exact assigned curriculum', async () => {
    const scopes = await resolveInboundCourseScopes(
      {
        courseraCourseId: 'shared-provider-course',
        assignments: [
          { programSlug: 'program-a', curriculumVersion: APPROVED_CURRICULUM_VERSION },
          { programSlug: 'program-b', curriculumVersion: LEGACY_CURRICULUM_VERSION },
        ],
        fallbackProgramSlug: 'program-a',
        fallbackCurriculumVersion: APPROVED_CURRICULUM_VERSION,
      },
      async () => ({
        status: 'matched_assignment',
        targets: [
          {
            courseraCourseId: 'shared-provider-course',
            programSlug: 'program-a',
            curriculumVersion: APPROVED_CURRICULUM_VERSION,
            courseSlug: 'course-a',
          },
          {
            courseraCourseId: 'shared-provider-course',
            programSlug: 'program-b',
            curriculumVersion: LEGACY_CURRICULUM_VERSION,
            courseSlug: 'course-b',
          },
        ],
      }),
    );
    assert.deepEqual(scopes.map((scope) => scope.programSlug), ['program-a', 'program-b']);
  });

  it('fails closed instead of falling back to primary when an exact id misses assignments', async () => {
    const scopes = await resolveInboundCourseScopes(
      {
        courseraCourseId: 'unknown-provider-course',
        assignments: [{ programSlug: 'primary-program', curriculumVersion: LEGACY_CURRICULUM_VERSION }],
        fallbackProgramSlug: 'primary-program',
        fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
      },
      async () => ({ status: 'unmapped', targets: [] }),
    );
    assert.deepEqual(scopes, []);
  });

  it('keeps primary fallback only when no provider id is present', async () => {
    const scopes = await resolveInboundCourseScopes({
      assignments: [{ programSlug: 'primary-program', curriculumVersion: LEGACY_CURRICULUM_VERSION }],
      fallbackProgramSlug: 'primary-program',
      fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
    });
    assert.deepEqual(scopes, [{
      programSlug: 'primary-program',
      curriculumVersion: LEGACY_CURRICULUM_VERSION,
      assignmentMatched: true,
    }]);
  });

  it('does not invent a detached scope without a provider id or assignment', async () => {
    const scopes = await resolveInboundCourseScopes({
      requireResolvedDetachedCourse: true,
      assignments: [],
      fallbackProgramSlug: null,
      fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
    }, async () => { throw new Error('Providerless statements must not query mappings'); });
    assert.deepEqual(scopes, []);
  });

  it('retains the detached no-reward path for one exact legacy target', async () => {
    let calls = 0;
    const scopes = await resolveInboundCourseScopes({
      requireResolvedDetachedCourse: true,
      courseraCourseId: '  exact-provider-id  ',
      assignments: [],
      fallbackProgramSlug: null,
      fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
    }, async (args) => {
      calls += 1;
      assert.equal(args.courseraCourseId, 'exact-provider-id');
      assert.deepEqual(args.assignments, []);
      return selectCurriculumMappingTargets({
        assignments: args.assignments,
        candidates: [{
          courseraCourseId: 'exact-provider-id',
          programSlug: 'legacy-program',
          curriculumVersion: LEGACY_CURRICULUM_VERSION,
          courseSlug: 'legacy-course',
        }],
      });
    });
    assert.equal(calls, 1);
    assert.deepEqual(scopes, [{
      programSlug: null,
      curriculumVersion: LEGACY_CURRICULUM_VERSION,
      assignmentMatched: false,
    }]);
  });

  for (const candidates of [[], [
    { programSlug: 'program-a', courseSlug: 'course-a' },
    { programSlug: 'program-b', courseSlug: 'course-b' },
  ]]) {
    it(`leaves ${candidates.length === 0 ? 'unmapped' : 'ambiguous'} detached attribution unresolved`, async () => {
      const scopes = await resolveInboundCourseScopes({
        requireResolvedDetachedCourse: true,
        courseraCourseId: 'shared-provider-id',
        assignments: [],
        fallbackProgramSlug: null,
        fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
      }, async ({ assignments }) => selectCurriculumMappingTargets({
        assignments,
        candidates: candidates.map((candidate) => ({
          ...candidate,
          courseraCourseId: 'shared-provider-id',
          curriculumVersion: LEGACY_CURRICULUM_VERSION,
        })),
      }));
      assert.deepEqual(scopes, []);
    });
  }

  it('propagates a mapping read failure instead of classifying it as unresolved attribution', async () => {
    await assert.rejects(resolveInboundCourseScopes({
      requireResolvedDetachedCourse: true,
      courseraCourseId: 'provider-id',
      assignments: [],
      fallbackProgramSlug: null,
      fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
    }, async () => { throw new Error('mapping store unavailable'); }), /mapping store unavailable/);
  });

  it('does not promote a detached learner through an approved-only mapping', async () => {
    const curriculumIndex = emptyCurriculumMappingIndex();
    curriculumIndex.byCourseraCourseId.set('approved-only-provider-id', [{
      courseraCourseId: 'approved-only-provider-id',
      programSlug: 'approved-program',
      curriculumVersion: APPROVED_CURRICULUM_VERSION,
      courseSlug: 'approved-course',
    }]);
    const scopes = await resolveInboundCourseScopes({
      requireResolvedDetachedCourse: true,
      courseraCourseId: 'approved-only-provider-id',
      assignments: [],
      fallbackProgramSlug: null,
      fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
    }, (args) => resolveProviderCourseMappings({
      ...args,
      curriculumIndex,
      canonicalIndex: emptyCanonicalMappingIndex(),
    }));
    assert.deepEqual(scopes, []);
  });

  for (const courseraCourseId of [undefined, 'provider-course']) {
    it(`preserves the default caller's detached ${courseraCourseId ? 'provider' : 'providerless'} fallback`, async () => {
      const scopes = await resolveInboundCourseScopes({
        courseraCourseId,
        assignments: [],
        fallbackProgramSlug: null,
        fallbackCurriculumVersion: LEGACY_CURRICULUM_VERSION,
      }, async () => { throw new Error('Default caller must defer detached mapping to completion'); });
      assert.deepEqual(scopes, [{
        programSlug: null,
        curriculumVersion: LEGACY_CURRICULUM_VERSION,
        assignmentMatched: false,
      }]);
    });
  }
});
