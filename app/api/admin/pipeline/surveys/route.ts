import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';

function daysSince(date: Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

export const GET = withApiGuc(async (req: NextRequest) => {
  try {
    const user = await getUser();
    if (!user || (!(await isAdmin(user.id)) && !(await isCounselor(user.id)))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const superAdmin = await isSuperAdmin(user.id);
    const orgId = superAdmin ? null : await getActorOrganizationId(user.id);
    const orgScope = orgId ? { user: { organizationId: orgId } } : {};

    const [totalSent, totalCompleted, atRiskRows] = await Promise.all([
      prisma.placementSurvey.count({ where: { ...orgScope, sentAt: { not: null } } }),
      prisma.placementSurvey.count({ where: { ...orgScope, sentAt: { not: null }, completedAt: { not: null } } }),
      prisma.placementSurvey.findMany({
        where: {
          ...orgScope,
          wave: 'thirty_day',
          completedAt: { not: null },
          sentAt: { not: null, lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { sentAt: 'asc' },
        take: 100,
      }),
    ]);

    // Batch-fetch users and placements separately (relations removed from model)
    const userIds = atRiskRows.map((r) => r.userId);
    const placementIds = atRiskRows.map((r) => r.placementId);
    const [users, placements] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, email: true },
      }),
      prisma.placementRecord.findMany({
        where: { id: { in: placementIds } },
        select: { id: true, employerName: true, jobTitle: true, placedAt: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const placementMap = new Map(placements.map((p) => [p.id, p]));

    const atRisk = atRiskRows.map((s) => {
      const u = userMap.get(s.userId);
      const p = placementMap.get(s.placementId);
      return {
        id: s.placementId,
        userId: s.userId,
        fullName: u?.fullName ?? null,
        email: u?.email ?? null,
        employerName: p?.employerName ?? '—',
        jobTitle: p?.jobTitle ?? '—',
        placedAt: p?.placedAt?.toISOString() ?? '',
        daysSincePlacement: p?.placedAt ? daysSince(p.placedAt) : 0,
        surveySent: true,
        surveyCompleted: false,
        wave: s.wave,
      };
    });

    const responseRate = totalSent > 0 ? Math.round((totalCompleted / totalSent) * 100) : 0;

    return NextResponse.json({
      stats: {
        totalSent,
        totalCompleted,
        responseRate,
        atRiskCount: atRisk.length,
      },
      atRisk,
    });
  } catch (error) {
    console.error('/admin/pipeline/surveys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
