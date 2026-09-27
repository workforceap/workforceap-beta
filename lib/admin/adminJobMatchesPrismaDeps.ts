import { prisma } from '@/lib/db/prisma';
import {
  getOrComputeAiJobMatches,
  markAiJobMatchEmptyCooldown,
  clearAiJobMatchEmptyCooldown,
} from '@/lib/admin/aiJobMatchCompute';
import { createNotification } from '@/lib/notifications/create';
import type { RunAdminJobMatchesDeps } from '@/lib/admin/runAdminJobMatchesGet';

const jobSelectForMatch = {
  id: true,
  title: true,
  requirements: true,
  suggestedPrograms: true,
  preferredCertifications: true,
};

const aiJobMatchStudentInclude = {
  student: {
    select: {
      id: true,
      fullName: true,
      email: true,
      enrolledProgram: true,
      assessmentScorePct: true,
      profile: { select: { city: true, state: true } },
      userCertifications: { select: { certName: true } },
    },
  },
};

function findAiJobMatchRowsForAdmin(jobId: string, organizationId: string) {
  return prisma.aIJobMatch.findMany({
    where: {
      jobId,
      job: { organizationId },
      student: { organizationId, deletedAt: null },
    },
    include: aiJobMatchStudentInclude,
    orderBy: { matchScore: 'desc' },
    take: 10,
  });
}

/**
 * Shared Prisma-backed callbacks for {@link runAdminJobMatchesGet}.
 * Supply {@link RunAdminJobMatchesDeps.logDiagnostic} per call site (admin UI vs employer auto-match).
 */
export function createAdminJobMatchesPrismaDeps(
  organizationId: string,
  logDiagnostic: RunAdminJobMatchesDeps['logDiagnostic']
): RunAdminJobMatchesDeps {
  return {
    findAuthorizedJob: (jid) =>
      prisma.job.findFirst({
        where: { id: jid, organizationId },
        select: jobSelectForMatch,
      }),
    findCachedRows: (jid) => findAiJobMatchRowsForAdmin(jid, organizationId),
    computeMatches: (jid, job) => getOrComputeAiJobMatches(jid, organizationId, job),
    persistMatches: async (jid, matches) => {
      if (matches.length === 0) return;
      const existing = await prisma.aIJobMatch.findMany({
        where: {
          jobId: jid,
          job: { organizationId },
          student: { organizationId, deletedAt: null },
        },
        select: { studentId: true },
      });
      const existingIds = new Set(existing.map((e) => e.studentId));
      const candidateIds = [...new Set(matches.map((match) => match.studentId))];
      const authorizedCandidates = candidateIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: candidateIds }, organizationId, deletedAt: null },
            select: { id: true },
          })
        : [];
      const authorizedIds = new Set(authorizedCandidates.map((candidate) => candidate.id));
      const newMatches = matches.filter(
        (match) => authorizedIds.has(match.studentId) && !existingIds.has(match.studentId),
      );

      if (newMatches.length > 0) {
        await prisma.aIJobMatch.createMany({
          data: newMatches.map((m) => ({
            jobId: jid,
            studentId: m.studentId,
            matchScore: m.matchScore,
            matchReasons: m.matchReasons,
          })),
          skipDuplicates: true,
        });

        const job = await prisma.job.findFirst({
          where: { id: jid, organizationId },
          select: { title: true },
        });

        for (const m of newMatches) {
          // A candidate can be retired or moved after scoring/persistence.
          // Revalidate immediately before the external notification effect.
          const activeCandidate = await prisma.user.findFirst({
            where: { id: m.studentId, organizationId, deletedAt: null },
            select: { id: true },
          });
          if (!activeCandidate) continue;
          await createNotification({
            userId: m.studentId,
            subjectMemberId: m.studentId,
            type: 'job_match',
            title: 'New job match',
            body: `We found a match: ${job?.title ?? 'a new position'}`,
            data: { jobId: jid, matchScore: m.matchScore },
          });
        }
      }
    },
    markMatchesComputedAt: (jid) =>
      prisma.job.updateMany({
        where: { id: jid, organizationId },
        data: { aiMatchesComputedAt: new Date() },
      }),
    reloadRows: (jid) => findAiJobMatchRowsForAdmin(jid, organizationId),
    markEmptyCooldown: (jid) => markAiJobMatchEmptyCooldown(jid, organizationId),
    clearEmptyCooldown: (jid) => clearAiJobMatchEmptyCooldown(jid, organizationId),
    logDiagnostic,
  };
}
