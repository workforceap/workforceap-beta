import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { WIOA_DEMOGRAPHICS_CAP, isListTruncated } from '@/lib/db/queryCaps';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';

async function _GET(req: NextRequest) {
  try {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orgId = await getActorOrganizationId(user.id);
  const params = req.nextUrl.searchParams;
  const year = parseInt(params.get('year') || String(new Date().getFullYear()), 10);
  const quarter = params.get('quarter') || undefined;
  const state = params.get('state') || undefined;

  const dateRange = quarter ? getQuarterRange(year, quarter) : { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) };

  const report = await withTenantScope(orgId, async (db) => {
    // One definition of "a member" (WAP-182 item 3): the helper, never a
    // hand-rolled role filter. A bare `user_roles` member row is the
    // baseline every account gets from `ensureAppUser`, so filtering on it
    // alone both counted staff and dropped every not-yet-backfilled member
    // — and it skipped the fixture-email exclusion a funder report needs.
    const totalMembers = await db.user.count({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE, createdAt: dateRange },
    });

    const enrolledMembers = await db.courseEnrollment.count({
      where: { enrolledAt: dateRange },
    });

    const completedMembers = await db.courseProgress.groupBy({
      by: ['userId'],
      where: { status: 'COMPLETED', completedAt: dateRange },
      _count: { userId: true },
    });

    const placedMembers = await db.placementRecord.count({
      where: { placedAt: dateRange },
    });

    const avgSalary = await db.placementRecord.aggregate({
      where: { placedAt: dateRange },
      _avg: { salaryOffered: true },
    });

    const demographics = await db.user.findMany({
      where: { deletedAt: null, ...MEMBER_ONLY_WHERE, createdAt: dateRange },
      select: {
        profile: { select: { ethnicity: true, veteranStatus: true, educationLevel: true, state: true } },
      },
      take: WIOA_DEMOGRAPHICS_CAP,
    });

    const programs = await db.courseEnrollment.groupBy({
      by: ['programSlug'],
      where: { enrolledAt: dateRange },
      _count: { programSlug: true },
    });

    return {
      year,
      quarter,
      state,
      totalMembers,
      enrolledMembers,
      completedMembers: completedMembers.length,
      placedMembers,
      avgSalary: avgSalary._avg.salaryOffered ?? 0,
      demographics: aggregateDemographics(demographics as Array<{ profile: { ethnicity: string | null; veteranStatus: string | null; educationLevel: string | null; state: string | null } | null }>),
      demographicsSampleSize: demographics.length,
      demographicsTruncated: isListTruncated(demographics.length, WIOA_DEMOGRAPHICS_CAP, totalMembers),
      programs,
    };
  });

  // AUDIT §H-DEP4: WIOA reports surface ethnicity, veteran-status, and
  // education-level data; every read must be auditable.
  await auditLog({
    actorUserId: user.id,
    action: 'admin.report.wioa',
    targetType: 'WioaReport',
    metadata: {
      year,
      quarter: quarter ?? null,
      state: state ?? null,
      organizationId: orgId,
      totalMembers: report.totalMembers,
      placedMembers: report.placedMembers,
    },
  }).catch((err) => console.error('[admin/reports/wioa] audit log failed:', err));
  await logAuditEvent({
    user: { id: user.id, role: 'admin' },
    verb: 'viewed',
    object: { type: 'WioaReport', id: `${year}-${quarter ?? 'annual'}` },
    result: {
      success: true,
      extensions: {
        year,
        quarter: quarter ?? null,
        state: state ?? null,
        organizationId: orgId,
        totalMembers: report.totalMembers,
        placedMembers: report.placedMembers,
      },
    },
    request: auditRequestMeta(req),
    orgId,
  }).catch((err) => console.error('[admin/reports/wioa] xAPI audit log failed:', err));

  return NextResponse.json(report);

  } catch (error) {
    console.error('/admin/reports/wioa error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


function getQuarterRange(year: number, quarter: string) {
  const q = parseInt(quarter.replace('Q', ''), 10);
  const start = new Date(year, (q - 1) * 3, 1);
  const end = new Date(year, q * 3, 0, 23, 59, 59);
  return { gte: start, lte: end };
}

function aggregateDemographics(users: Array<{ profile: { ethnicity: string | null; veteranStatus: string | null; educationLevel: string | null; state: string | null } | null }>) {
  const eth: Record<string, number> = {};
  const vet: Record<string, number> = {};
  const edu: Record<string, number> = {};
  const states: Record<string, number> = {};
  for (const u of users) {
    const p = u.profile;
    if (p?.ethnicity) eth[p.ethnicity] = (eth[p.ethnicity] || 0) + 1;
    if (p?.veteranStatus) vet[p.veteranStatus] = (vet[p.veteranStatus] || 0) + 1;
    if (p?.educationLevel) edu[p.educationLevel] = (edu[p.educationLevel] || 0) + 1;
    if (p?.state) states[p.state] = (states[p.state] || 0) + 1;
  }
  return { ethnicity: eth, veteranStatus: vet, educationLevel: edu, state: states };
}
export const GET = withApiGuc(_GET);
