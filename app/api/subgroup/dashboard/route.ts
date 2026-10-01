import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { getSubgroupsForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { memberProgramCompleted } from '@/lib/partner/memberProgress';

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
          enrolledProgram: true,
          courseEnrollments: {
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          enrolledAt: true,
          deletedAt: true,
          placementRecord: { select: { id: true } },
          memberProgramProgress: {
            select: { programSlug: true, averagePercent: true, coursesCompleted: true },
          },
        },
      },
    },
  }));

  const seen = new Set<string>();
  let total = 0;
  let enrolled = 0;
  let completed = 0;
  let placed = 0;

  for (const ms of memberSubgroups) {
    if (ms.member.deletedAt) continue;
    if (seen.has(ms.member.id)) continue;
    seen.add(ms.member.id);

    total++;
    const m = ms.member;
    const assignment = resolveTrainingProgressAssignment(
      m.enrolledProgram,
      m.courseEnrollments,
    );
    if (m.enrolledAt && assignment.programSlug) enrolled++;
    if (memberProgramCompleted({
      enrolledProgram: assignment.programSlug,
      curriculumVersion: assignment.curriculumVersion,
      coursesCompleted: null,
      liveProgress: m.memberProgramProgress,
    })) completed++;
    if (m.placementRecord) placed++;
  }

  return NextResponse.json({
    subgroups: subgroups.map((s) => s.subgroup),
    stats: {
      total,
      enrolled,
      completed,
      placed,
      active: total - placed,
    },
  });

  } catch (error) {
    console.error('/subgroup/dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

