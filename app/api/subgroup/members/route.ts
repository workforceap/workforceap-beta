import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getSubgroupsForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { memberProgramProgressPct } from '@/lib/partner/memberProgress';
import { getPipelineStage, PIPELINE_STAGE_LABELS, type PipelineStudent } from '@/lib/pipeline/stage';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { subgroupPlacementSummary } from '@/lib/subgroup/memberPayload';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const GET = withApiGuc(async () => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let subgroups: { subgroupId: string; subgroup: { id: string; name: string; type: string } }[];
  try {
    subgroups = await getSubgroupsForUser(user.id);
  } catch {
    return NextResponse.json({ error: 'Forbidden: subgroup leader access required' }, { status: 403 });
  }
  if (subgroups.length === 0) {
    return NextResponse.json({ error: 'Forbidden: no subgroups assigned' }, { status: 403 });
  }

  const subgroupIds = subgroups.map((s) => s.subgroupId);
  const memberSubgroups = await prisma.$transaction((tx) => tx.memberSubgroup.findMany({
    where: { subgroupId: { in: subgroupIds } },
    take: 1000,
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          enrolledProgram: true,
          courseEnrollments: {
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          enrolledAt: true,
          updatedAt: true,
          deletedAt: true,
          assessmentCompleted: true,
          placementRecord: {
            select: { employerName: true, jobTitle: true, placedAt: true },
          },
          userCertifications: { select: { certName: true, earnedAt: true } },
          applications: { select: { status: true, submittedAt: true } },
          memberProgramProgress: {
            select: { programSlug: true, averagePercent: true, coursesCompleted: true },
          },
        },
      },
    },
  }));

  const seen = new Set<string>();
  const members = memberSubgroups
    .filter((ms) => !ms.member.deletedAt && !seen.has(ms.member.id))
    .map((ms) => {
      seen.add(ms.member.id);
      const m = ms.member;
      const assignment = resolveTrainingProgressAssignment(
        m.enrolledProgram,
        m.courseEnrollments,
      );
      const program = assignment.programSlug ? getProgramBySlug(assignment.programSlug) : null;
      const pct = memberProgramProgressPct({
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        coursesCompleted: null,
        liveProgress: m.memberProgramProgress,
      });
      const student: PipelineStudent = {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        enrolledProgram: assignment.programSlug,
        curriculumVersion: assignment.curriculumVersion,
        enrolledAt: m.enrolledAt,
        assessmentCompleted: m.assessmentCompleted,
          deletedAt: m.deletedAt,
        placementRecord: m.placementRecord,
        userCertifications: m.userCertifications,
        applications: m.applications,
        memberProgramProgress: m.memberProgramProgress,
      };
      const stage = getPipelineStage(student);
      return {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        enrolledProgram: assignment.programSlug ? programDisplayTitle(assignment.programSlug) : assignment.programSlug,
        enrolledAt: m.enrolledAt,
        progressPct: pct,
        stage: PIPELINE_STAGE_LABELS[stage],
        placementRecord: subgroupPlacementSummary(m.placementRecord),
      };
    });

  return NextResponse.json({
    subgroups: subgroups.map((s) => s.subgroup),
    members,
  });

  } catch (error) {
    console.error('/subgroup/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

