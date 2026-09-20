import type { CourseEnrollment, Prisma } from '@prisma/client';
import {
  canonicalizeProgramSlug,
  programSlugReadCandidates,
} from '@/lib/content/programSlug';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';

type EnrollmentCreateData = Omit<
  Prisma.CourseEnrollmentUncheckedCreateInput,
  'userId' | 'programSlug' | 'curriculumVersion'
> & { curriculumVersion: string };

type EnrollmentUpdateData = Omit<
  Prisma.CourseEnrollmentUncheckedUpdateInput,
  'curriculumVersion'
> & { curriculumVersion?: never };

/**
 * The Prisma surface the canonical writer needs. An interactive transaction
 * client and a tenant-scoped client (`withTenantScope`) both satisfy it, so
 * every program-assignment write can go through this one module.
 */
export type CourseEnrollmentWriterClient = Pick<
  Prisma.TransactionClient,
  'courseEnrollment' | 'courseProgress' | 'memberProgramProgress'
>;

export type AssignedCourseEnrollment = CourseEnrollment & {
  /**
   * `created` when no equivalent assignment existed before this call and a
   * canonical row was written; `updated` when an existing row (canonical or
   * retired alias) was reused. A concurrent request that wins the same
   * composite key is still reported as `created` by the loser.
   */
  assignmentOutcome: 'created' | 'updated';
};

/**
 * The only production writer that creates `CourseEnrollment` rows.
 *
 * Create or update one logical program assignment without duplicating an
 * older row stored under a retired program alias. New rows always use the
 * canonical slug; existing rows keep both their stored slug and immutable
 * curriculumVersion and are updated by primary key.
 *
 * `lib/member/curriculumAssignmentWriters.test.ts` and the repo ESLint config
 * reject `courseEnrollment.create` / `.upsert` anywhere else.
 */
export async function upsertEquivalentCourseEnrollment(
  tx: CourseEnrollmentWriterClient,
  args: {
    userId: string;
    programSlug: string;
    preserveLegacyAssignment?: boolean;
    create: EnrollmentCreateData;
    update: EnrollmentUpdateData;
  },
): Promise<AssignedCourseEnrollment> {
  const canonicalProgramSlug = canonicalizeProgramSlug(args.programSlug);
  const equivalentRows = await tx.courseEnrollment.findMany({
    where: {
      userId: args.userId,
      programSlug: { in: programSlugReadCandidates(canonicalProgramSlug) },
    },
    select: { id: true, programSlug: true, isPrimary: true },
  });
  const existing = equivalentRows.sort((a, b) => {
    const aCanonical = a.programSlug === canonicalProgramSlug ? 1 : 0;
    const bCanonical = b.programSlug === canonicalProgramSlug ? 1 : 0;
    if (aCanonical !== bCanonical) return bCanonical - aCanonical;
    return Number(b.isPrimary) - Number(a.isPrimary);
  })[0];

  if (existing) {
    const updated = await tx.courseEnrollment.update({
      where: { id: existing.id },
      data: args.update,
    });
    return { ...updated, assignmentOutcome: 'updated' };
  }

  let curriculumVersion = args.create.curriculumVersion;
  if (curriculumVersion !== LEGACY_CURRICULUM_VERSION) {
    const equivalentProgramSlugs = programSlugReadCandidates(canonicalProgramSlug);
    const [courseProgressCount, programProgressCount] = await Promise.all([
      tx.courseProgress.count({
        where: {
          userId: args.userId,
          programSlug: { in: equivalentProgramSlugs },
        },
      }),
      tx.memberProgramProgress.count({
        where: {
          userId: args.userId,
          programSlug: { in: equivalentProgramSlugs },
        },
      }),
    ]);
    if (
      args.preserveLegacyAssignment === true
      || courseProgressCount > 0
      || programProgressCount > 0
    ) {
      // A missing CourseEnrollment is a pre-versioning compatibility gap, not
      // permission to reinterpret existing progress as the newest curriculum.
      // Preserve the learner on legacy; a deliberate migration must be a
      // separate attended operation with its own proof and rollback.
      curriculumVersion = LEGACY_CURRICULUM_VERSION;
    }
  }

  // Keep exact-key retry safety for concurrent requests while still handling
  // legacy aliases through the lookup above.
  const created = await tx.courseEnrollment.upsert({
    where: {
      userId_programSlug: {
        userId: args.userId,
        programSlug: canonicalProgramSlug,
      },
    },
    create: {
      ...args.create,
      userId: args.userId,
      programSlug: canonicalProgramSlug,
      curriculumVersion: curriculumVersion,
    },
    update: { ...args.update },
  });
  return { ...created, assignmentOutcome: 'created' };
}
