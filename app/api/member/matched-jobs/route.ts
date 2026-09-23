import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { ACTIVE_EMPLOYER_JOB_WHERE } from '@/lib/jobs/memberVisibleJob';
import {
  MATCH_WEIGHTS,
  scoreProgramAlignment,
  scoreAssessmentReadiness,
  scoreCertifications,
  scoreCourseCompletion,
  scoreSkillsMatching,
} from '@/lib/ai/matchWeights';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    try {
    const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: user.id, deletedAt: null },
      select: {
        enrolledProgram: true,
        assessmentScorePct: true,
        memberProgramProgress: {
          select: { programSlug: true, averagePercent: true, coursesCompleted: true },
        },
        courseProgress: {
          where: { status: 'COMPLETED' },
          select: { programSlug: true, courseSlug: true },
        },
        // Same certification set as the employer-side matcher
        // (lib/ai/matchStudents.ts): staff-rejected rows never count.
        userCertifications: {
          where: { status: { not: 'rejected' } },
          select: { certName: true, status: true },
        },
      },
    }));
  
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  
    // Fetch live jobs only (limit to avoid full-table scan)
    const jobs = await prisma.$transaction((tx) => tx.job.findMany({
      where: {
        status: 'live',
        AND: [
          ACTIVE_EMPLOYER_JOB_WHERE,
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } },
            ],
          },
        ],
      },
      include: {
        employer: { select: { companyName: true } },
      },
      take: 50,
    }));
  
    const program = dbUser.enrolledProgram ? getProgramBySlug(dbUser.enrolledProgram) : null;
    const programSkills = program?.skills ?? [];
    const certs = dbUser.userCertifications ?? [];
    const courses = dbUser.enrolledProgram
      ? dbUser.courseProgress
          .filter((row) => row.programSlug === dbUser.enrolledProgram)
          .map((row) => row.courseSlug)
      : [];
    const rollup = dbUser.enrolledProgram
      ? dbUser.memberProgramProgress.find((row) => row.programSlug === dbUser.enrolledProgram) ?? null
      : null;
    const courseScoreInput = rollup
      ? new Array(Math.max(0, rollup.coursesCompleted)).fill('') as string[]
      : courses;
  
    const scored = jobs.map((job) => {
      const progSlugs = new Set((job.suggestedPrograms ?? []).map((p) => p.toLowerCase()));
      const reqLower = (job.requirements ?? []).map((r) => r.toLowerCase());
      const certLower = (job.preferredCertifications ?? []).map((c) => c.toLowerCase());
  
      let weightedSum = 0;
      weightedSum += MATCH_WEIGHTS.programAlignment * scoreProgramAlignment(dbUser.enrolledProgram, progSlugs).score;
      weightedSum += MATCH_WEIGHTS.assessmentReadiness * scoreAssessmentReadiness(dbUser.assessmentScorePct ?? null).score;
      weightedSum += MATCH_WEIGHTS.certifications * scoreCertifications(certs, certLower).score;
      weightedSum += MATCH_WEIGHTS.courseCompletion * scoreCourseCompletion(courseScoreInput).score;
      weightedSum += MATCH_WEIGHTS.skillsMatching * scoreSkillsMatching(reqLower, programSkills).score;
  
      const matchPct = Math.round(Math.min(100, weightedSum * 100));
  
      return {
        id: job.id,
        title: job.title,
        company: job.employer.companyName,
        location: job.location ?? 'Remote',
        locationType: job.locationType,
        matchPct,
      };
    });
  
    scored.sort((a, b) => b.matchPct - a.matchPct);
  
    return NextResponse.json({ jobs: scored.slice(0, 5) });
    } catch (err) {
      captureApiError(err, { route: 'member/matched-jobs' });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/matched-jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
