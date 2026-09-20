/**
 * Multi-course-enrollment schema invariants, read from the generated Prisma
 * DMMF (what the client enforces) instead of schema.prisma text:
 *   1. `isPrimary` boolean defaulting to false
 *   2. no single-column `userId` unique any more
 *   3. (userId, programSlug) composite unique — the duplicate-program guard
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'CourseEnrollment');

describe('CourseEnrollment schema', () => {
  it('is mapped to course_enrollments', () => {
    assert.ok(model, 'CourseEnrollment model not found in the Prisma client');
    assert.equal(model.dbName, 'course_enrollments');
  });

  it('declares isPrimary boolean with default false', () => {
    const isPrimary = model!.fields.find((f) => f.name === 'isPrimary');
    assert.ok(isPrimary, 'isPrimary field missing');
    assert.equal(isPrimary.type, 'Boolean');
    assert.equal(isPrimary.isRequired, true);
    assert.equal(isPrimary.default, false);
    assert.equal(isPrimary.dbName, 'is_primary');
  });

  it('does NOT have userId @unique anymore', () => {
    const userId = model!.fields.find((f) => f.name === 'userId');
    assert.ok(userId, 'userId field missing');
    assert.equal(userId.isUnique, false, 'userId still has a single-column @unique — a learner could hold one program only');
    assert.equal(userId.isId, false);
    assert.equal(model!.primaryKey, null, 'the row identity stays the uuid id, not a userId key');
  });

  it('has @@unique([userId, programSlug]) and no other composite unique', () => {
    assert.deepEqual(model!.uniqueFields, [['userId', 'programSlug']], 'composite unique on (userId, programSlug) missing — duplicate-program guard gone');
    assert.deepEqual(
      model!.uniqueIndexes.map((index) => index.fields),
      [['userId', 'programSlug']],
    );
  });

  it('pins the immutable curriculum version with the legacy default', () => {
    const version = model!.fields.find((f) => f.name === 'curriculumVersion');
    assert.ok(version, 'curriculumVersion field missing');
    assert.equal(version.type, 'String');
    assert.equal(version.isRequired, true);
    assert.equal(version.default, 'legacy-v1');
    assert.equal(version.dbName, 'curriculum_version');
  });
});
