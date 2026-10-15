import { prisma } from '@/lib/db/prisma';
import { DISCOVERED_COURSERA_PROGRAMS } from '@/lib/content/courseraDiscoveredCatalog';
import { getProgramCurriculumManifest, normalizeCourseraCourseId } from '@/lib/content/programCurriculumManifest';
import { canonicalizeProgramSlug, programSlugReadCandidates } from '@/lib/content/programSlug';
import { fetchLearnerProgressFromB4B } from '@/lib/coursera/learnerProgress';
import { getProgramBySlug } from '@/lib/content/programs';

/** Approval permits new enrollment; only provider records or successful course
 * enrollment receipts establish access. Manual completion and invitations do not. */
export async function hasMemberCourseraCourseAccess(args: {
  userId: string;
  email?: string | null;
  organizationId: string | null;
  programSlug: string;
  curriculumVersion: string;
  courseSlug: string;
  courseraCourseId?: string;
}): Promise<boolean> {
  if (!args.organizationId) return false;
  const canonicalProgram = getProgramBySlug(args.programSlug)?.slug ?? canonicalizeProgramSlug(args.programSlug);
  const discovered = DISCOVERED_COURSERA_PROGRAMS[canonicalProgram];
  const courseId = normalizeCourseraCourseId(args.courseraCourseId
    ?? discovered?.courses.find((course) => course.slug === args.courseSlug)?.courseId ?? '');
  if (!courseId) return false;
  const providerProgramId = getProgramCurriculumManifest(canonicalProgram, args.curriculumVersion)
    ?.externalTrack?.collectionId ?? discovered?.courseraProgramId;
  const providerRow = await prisma.courseraCourseProgress.findFirst({
    where: {
      userId: args.userId,
      organizationId: args.organizationId,
      programSlug: { in: programSlugReadCandidates(canonicalProgram) },
      courseraCourseId: { in: [courseId, `Course~${courseId}`] },
    },
    orderBy: { lastSyncedAt: 'desc' },
    select: { isRemovedFromProgram: true, lastSyncedAt: true },
  });
  if (providerRow && !providerRow.isRemovedFromProgram) return true;
  if (!providerProgramId) return false;

  // The POST already writes these receipts before responding. They bridge
  // provider acceptance → eventual progress sync, without inventing progress.
  // A later provider removal supersedes an older successful enrollment.
  const receipt = await prisma.auditLog.findFirst({
    where: {
      action: 'coursera_course_enrolled',
      targetType: 'User',
      targetId: args.userId,
      ...(providerRow ? { createdAt: { gt: providerRow.lastSyncedAt } } : {}),
      AND: [
        { metadata: { path: ['organizationId'], equals: args.organizationId } },
        { metadata: { path: ['programId'], equals: providerProgramId } },
        { metadata: { path: ['contentId'], equals: courseId } },
        { OR: [
          { metadata: { path: ['b4bStatus'], gte: 200, lt: 300 } },
          { AND: [
            { metadata: { path: ['alreadyEnrolled'], equals: true } },
            { OR: [
              { metadata: { path: ['b4bStatus'], equals: 400 } },
              { metadata: { path: ['b4bStatus'], equals: 409 } },
            ] },
          ] },
        ] },
      ],
    },
    select: { id: true },
  });
  if (receipt) return true;
  // Delayed xAPI delivery is not proof of re-enrollment after removal. Only
  // a newer, successful enrollment receipt above can overturn that snapshot.
  if (providerRow) return false;

  // Historical xAPI/direct-sync learners need no new seat. CourseProgress is
  // also member-editable, so inspect exact provider identities/events instead.
  // Read the Prisma table directly: the mapping convenience helper runs DDL.
  const identities = await prisma.courseraIdentityMapping.findMany({
    where: { userId: args.userId },
    select: { courseraEmail: true, actorIdentifier: true, actorHomePage: true },
    take: 10, orderBy: { updatedAt: 'desc' },
  });
  const emails = [...new Set([args.email, ...identities.map((row) => row.courseraEmail)]
    .filter((email): email is string => Boolean(email?.trim())).map((email) => email.trim().toLowerCase()))];
  const actors = [
    // xAPI ingestion normalizes actor email to lowercase. Exact equality is
    // intentional: case-insensitive Prisma equality uses wildcard ILIKE.
    ...emails.map((email) => ({ actorEmail: email })),
    ...identities.flatMap((row) => row.actorIdentifier && row.actorHomePage
      ? [{ actorAccountName: row.actorIdentifier, actorHomePage: row.actorHomePage }] : []),
  ];
  if (actors.length) {
    const statement = await prisma.xapiStatement.findFirst({
      where: {
        organizationId: args.organizationId,
        courseId: { in: [courseId, `Course~${courseId}`] },
        processed: true,
        OR: actors,
      },
      select: { id: true },
    });
    if (statement) return true;
  }
  // An explicit removal wins over historical cached activity. Otherwise a
  // bounded read can recover direct-sync-only learners and audit-write outages.
  const email = identities.find((row) => row.courseraEmail)?.courseraEmail ?? args.email;
  if (email) {
    const live = await fetchLearnerProgressFromB4B(email, { programId: providerProgramId }).catch(() => new Map());
    return [...live.values()].some((row) => row.programId === providerProgramId
      && normalizeCourseraCourseId(row.contentId) === courseId);
  }
  return false;
}
