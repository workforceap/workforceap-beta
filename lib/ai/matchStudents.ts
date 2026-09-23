import { prisma } from '@/lib/db/prisma';
import { WORK_QUEUE_CAP } from '@/lib/db/scanCaps';
import { getProgramBySlug } from '@/lib/content/programs';
import {
  MATCH_WEIGHTS,
  scoreProgramAlignment,
  scoreAssessmentReadiness,
  scoreCertifications,
  scoreCourseCompletion,
  scoreSkillsMatching,
} from './matchWeights';

export interface StudentMatch {
  studentId: string;
  matchScore: number;
  matchReasons: string[];
}

export async function matchStudentsForJob(organizationId: string, job: {
  requirements: string[];
  suggestedPrograms: string[];
  preferredCertifications: string[];
}): Promise<StudentMatch[]> {
  const students = await prisma.user.findMany({
    take: WORK_QUEUE_CAP,
    orderBy: { enrolledAt: 'desc' },
    where: {
      organizationId,
      deletedAt: null,
      enrolledProgram: { not: null },
    },
    select: {
      id: true,
      enrolledProgram: true,
      assessmentScorePct: true,
      memberProgramProgress: {
        select: { programSlug: true, coursesCompleted: true },
      },
      courseProgress: {
        where: { status: 'COMPLETED' },
        select: { programSlug: true, courseSlug: true },
      },
      // Staff-rejected certifications never count (V08); status drives the
      // Verified vs Reported reason text in scoreCertifications.
      userCertifications: {
        where: { status: { not: 'rejected' } },
        select: { certName: true, status: true },
      },
      profile: { select: { city: true, state: true } },
    },
  });

  const progSlugs = new Set((job.suggestedPrograms ?? []).map((p) => p.toLowerCase()));
  const reqLower = (job.requirements ?? []).map((r) => r.toLowerCase());
  const certLower = (job.preferredCertifications ?? []).map((c) => c.toLowerCase());

  const scored: { student: (typeof students)[0]; score: number; reasons: string[] }[] = [];

  for (const s of students) {
    const reasons: string[] = [];
    let weightedSum = 0;

    const program = s.enrolledProgram ? getProgramBySlug(s.enrolledProgram) : null;
    const programSkills = program?.skills ?? [];

    const progResult = scoreProgramAlignment(s.enrolledProgram, progSlugs);
    if (progResult.reason) reasons.push(progResult.reason);
    weightedSum += MATCH_WEIGHTS.programAlignment * progResult.score;

    const assessResult = scoreAssessmentReadiness(s.assessmentScorePct ?? null);
    if (assessResult.reason) reasons.push(assessResult.reason);
    weightedSum += MATCH_WEIGHTS.assessmentReadiness * assessResult.score;

    const certResult = scoreCertifications(s.userCertifications ?? [], certLower);
    if (certResult.reason) reasons.push(certResult.reason);
    weightedSum += MATCH_WEIGHTS.certifications * certResult.score;

    const courses = s.enrolledProgram
      ? s.courseProgress
          .filter((row) => row.programSlug === s.enrolledProgram)
          .map((row) => row.courseSlug)
      : [];
    const rollup = s.enrolledProgram
      ? s.memberProgramProgress.find((row) => row.programSlug === s.enrolledProgram) ?? null
      : null;
    const courseResult = scoreCourseCompletion(
      rollup ? new Array(Math.max(0, rollup.coursesCompleted)).fill('') as string[] : courses,
    );
    if (courseResult.reason) reasons.push(courseResult.reason);
    weightedSum += MATCH_WEIGHTS.courseCompletion * courseResult.score;

    const skillsResult = scoreSkillsMatching(reqLower, programSkills);
    if (skillsResult.reason) reasons.push(skillsResult.reason);
    weightedSum += MATCH_WEIGHTS.skillsMatching * skillsResult.score;

    const score = Math.round(Math.min(100, weightedSum * 100));

    if (score > 0) {
      scored.push({
        student: s,
        score,
        reasons: [...new Set(reasons)],
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10).map(({ student, score, reasons }) => ({
    studentId: student.id,
    matchScore: score,
    matchReasons: reasons,
  }));
}
