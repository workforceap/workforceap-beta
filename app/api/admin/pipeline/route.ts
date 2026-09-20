import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

async function _GET(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user || (!(await isAdmin(user.id)) && !(await isCounselor(user.id)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = await getActorOrganizationId(user.id);
  const stage = req.nextUrl.searchParams.get('stage');

  const counts = await withTenantScope(orgId, async (db) => {
    // Member-role accounts only (`profile.role`), the predicate every roster
    // uses; `user_roles` is missing for 48 of 127 members and included staff
    // (number audit 2026-09-20, F8).
    const members = await db.user.findMany({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE },
      select: {
        id: true,
        createdAt: true,
        wioaQualificationJson: true,
        wioaReviewStatus: true,
        assessmentCompleted: true,
        courseEnrollments: { select: { id: true, fundingSource: true } },
        courseProgress: { select: { status: true } },
        placementRecord: { select: { id: true } },
        profile: { select: { resumeOriginalPath: true, resumeEnhancedPath: true } },
        aiToolResults: { select: { id: true }, take: 1 },
      },
      take: 500,
    });

    const c = {
      holding: 0,
      funding: 0,
      coursera: 0,
      paid: 0,
      complete: 0,
      ready: 0,
      placed: 0,
    };

    const programCourses: Record<string, number> = {};

    for (const m of members) {
      // Stage 7: Placed
      if (m.placementRecord) { c.placed++; continue; }

      // Stage 6: Workforce Ready
      const hasResume = m.profile?.resumeOriginalPath || m.profile?.resumeEnhancedPath;
      const hasAITool = m.aiToolResults.length > 0;
      if (m.assessmentCompleted && hasResume && hasAITool) { c.ready++; continue; }

      // Stage 5: Training Complete
      const allComplete = m.courseProgress.length > 0 && m.courseProgress.every((p) => p.status === 'COMPLETED');
      if (allComplete) { c.complete++; continue; }

      // Stage 4: Payment Received
      const hasFunding = m.courseEnrollments.some((e) => e.fundingSource && e.fundingSource.length > 0);
      if (hasFunding) { c.paid++; continue; }

      // Stage 3: Coursera Enrolled
      if (m.courseEnrollments.length > 0) { c.coursera++; continue; }

      // Stage 2: Funding Evaluated
      if (m.wioaQualificationJson || m.wioaReviewStatus) { c.funding++; continue; }

      // Stage 1: Holding Room
      c.holding++;
    }

    return c;
  });

  return NextResponse.json({ counts });

  } catch (error) {
    console.error('/admin/pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
