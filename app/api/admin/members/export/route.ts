import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { calculateHealthStatus, MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';
import { formatPhone } from '@/lib/formatPhone';
import { MEMBER_ONLY_WHERE, MEMBER_OR_DOGFOOD_WHERE } from '@/lib/admin/memberOnlyWhere';
import { buildDirectorySearchWhere, normalizeDirectorySearch } from '@/lib/admin/directorySearch';
import { buildStatusWhere, type StudentStatus } from '@/lib/admin/studentStatus';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const MAX_EXPORT = 5000;

function csvEscape(s: string | number | null | undefined): string {
  const str = s == null ? '' : String(s);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function formatDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString();
}

async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = normalizeDirectorySearch(searchParams.get('search') ?? '');
    const programFilter = (searchParams.get('program') ?? '').trim();
    const partnerFilter = (searchParams.get('partner') ?? '').trim();
    const statusFilter = (searchParams.get('status') ?? '').trim();
    const healthFilter = searchParams.get('health') ?? '';
    const notInCourse = searchParams.get('notInCourse') === '1';
    const needsAttention = searchParams.get('needsAttention') === '1';
    // Same population as the screen: members only unless the roster's
    // "Include staff accounts" box is ticked (audit S3; Mike: "remove staff
    // in count"). The export and the page must not disagree about who is on
    // the roster — that drift is what S13/S14/S17 were about.
    const includeStaff = searchParams.get('staff') === '1';
    const startDate = searchParams.get('startDate') ?? '';
    const endDate = searchParams.get('endDate') ?? '';

    const orgId = await getActorOrganizationId(user.id);

    const dateWhere: { enrolledAt?: { gte?: Date; lte?: Date } } = {};
    if (startDate) {
      const d = new Date(startDate);
      if (!Number.isNaN(d.getTime())) dateWhere.enrolledAt = { ...dateWhere.enrolledAt, gte: d };
    }
    if (endDate) {
      const d = new Date(endDate);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        dateWhere.enrolledAt = { ...dateWhere.enrolledAt, lte: d };
      }
    }

    // Apply directory filters before the export bound, so a matching member
    // outside the first 5,000 unfiltered records is still included.
    const where: Prisma.UserWhereInput = {
      ...(includeStaff ? MEMBER_OR_DOGFOOD_WHERE : MEMBER_ONLY_WHERE),
      ...dateWhere,
      deletedAt: statusFilter === 'dropped' ? { not: null } : null,
      AND: [
        buildDirectorySearchWhere(search),
        buildStatusWhere(statusFilter as StudentStatus),
      ],
      ...(programFilter ? { courseEnrollments: { some: { programSlug: programFilter } } } : {}),
      ...(partnerFilter ? {
        partnerReferrals: partnerFilter === '__none' ? { none: {} } : { some: { partnerId: partnerFilter } },
      } : {}),
    };
    const members = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: MAX_EXPORT,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          enrolledProgram: true,
          enrolledAt: true,
          memberStatus: true,
          staleTrainingDetectedAt: true,
          assessmentScorePct: true,
          assessmentCompleted: true,
          updatedAt: true,
          createdAt: true,
          lastLoginAt: true,
          pipelineBoardStage: true,
          profile: {
            select: {
              profilePhone: true,
              employmentStatus: true,
              educationLevel: true,
            },
          },
          courseEnrollments: {
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          partnerReferrals: {
            take: 1,
            orderBy: { referredAt: 'desc' },
            select: { partner: { select: { id: true, name: true } } },
          },
          placementRecord: {
            select: {
              employerName: true,
              jobTitle: true,
              startDate: true,
            },
          },
        },
      }),
    );

    // Get last activity events for health calculation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const lastEvents = await prisma.memberEvent.groupBy({
      by: ['userId'],
      where: {
        userId: { in: members.map((m) => m.id) },
        createdAt: { gte: thirtyDaysAgo },
        ...MEMBER_ACTIVITY_EVENT_WHERE,
      },
      _max: { createdAt: true },
    });
    const lastEventMap = new Map<string, Date>();
    for (const e of lastEvents) {
      if (e._max.createdAt) lastEventMap.set(e.userId, e._max.createdAt);
    }

    const recentEvents = await prisma.memberEvent.groupBy({
      by: ['userId'],
      where: {
        userId: { in: members.map((m) => m.id) },
        createdAt: { gte: thirtyDaysAgo },
        ...MEMBER_ACTIVITY_EVENT_WHERE,
      },
      _count: { _all: true },
    });
    const recentEventMap = new Map<string, number>();
    for (const e of recentEvents) {
      recentEventMap.set(e.userId, e._count._all);
    }

    // Coursera / course work writes no member_events row (Mike, 2026-09-20:
    // activity is "login, any Coursera action, any tools skills etc.").
    const courseActivity = await prisma.courseProgress.groupBy({
      by: ['userId'],
      where: { userId: { in: members.map((m) => m.id) } },
      _max: { lastActivityAt: true },
    });
    const courseActivityMap = new Map<string, Date>();
    for (const row of courseActivity) {
      if (row._max.lastActivityAt) courseActivityMap.set(row.userId, row._max.lastActivityAt);
    }

    // Derived health and attention filters retain the existing bounded behavior.
    const filtered = members.filter((m) => {
      const enrollmentSlugs = [
        ...(m.enrolledProgram ? [m.enrolledProgram] : []),
        ...m.courseEnrollments.map((e) => e.programSlug),
      ];

      // The one Health rule, shared with the screen. This used to be a
      // hand-rolled copy that keyed off enrollment age instead of activity
      // recency, so the roster's "At Risk" filter showed 2 rows and its CSV
      // returned 0 (audit 2026-09-20, S13).
      const healthStatus = calculateHealthStatus({
        lastEventAt: lastEventMap.get(m.id) ?? null,
        recentEventCount: recentEventMap.get(m.id) ?? 0,
        enrolledAt: m.enrolledAt,
        lastLoginAt: m.lastLoginAt,
        lastCourseActivityAt: courseActivityMap.get(m.id) ?? null,
      });
      const matchHealth = !healthFilter || healthStatus === healthFilter;

      const isNotInCourse = !m.enrolledProgram && enrollmentSlugs.length === 0;
      const matchNotInCourse = !notInCourse || isNotInCourse;

      const NEW_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
      const isNew = m.createdAt.getTime() > 0 && Date.now() - m.createdAt.getTime() <= NEW_MEMBER_WINDOW_MS;
      const reasons: string[] = [];
      if (healthStatus === 'red') reasons.push('Inactive');
      if (m.staleTrainingDetectedAt) reasons.push('Stale training');
      if (isNotInCourse) reasons.push('No assigned program');
      if (isNew) reasons.push('New');
      const matchAttention = !needsAttention || reasons.length > 0;

      return matchHealth && matchNotInCourse && matchAttention;
    });

    const headers = [
      'Name',
      'Email',
      'Program',
      'Status',
      'Pipeline Stage',
      'Enrollment Date',
      'Last Login',
      'Placement Status',
    ];

    const rows = filtered.map((m) => {
      // Same assignment the roster row resolves (primary enrollment first,
      // then an alias-equivalent legacy pointer). Reading the raw
      // `enrolledProgram` blanked Program for members whose program lives on a
      // CourseEnrollment row (audit 2026-09-20, S17).
      const assignment = resolveTrainingProgressAssignment(m.enrolledProgram, m.courseEnrollments);
      const programTitle = assignment.programSlug
        ? programDisplayTitle(canonicalizeProgramSlug(assignment.programSlug))
        : '';
      // The "Status" column is the member status the roster's Status chip
      // prints. It used to export `pipeline_board_stage`, so a placed member
      // exported "Active" and an active member exported "in_training"
      // (audit 2026-09-20, S14). The pipeline stage keeps its own column.
      const status = m.memberStatus ?? 'active';
      const placementStatus = m.placementRecord
        ? `Placed at ${m.placementRecord.employerName} — ${m.placementRecord.jobTitle}`
        : 'Not placed';

      return [
        m.fullName,
        m.email,
        programTitle,
        status,
        m.pipelineBoardStage ?? '',
        formatDate(m.enrolledAt),
        formatDate(m.lastLoginAt),
        placementStatus,
      ];
    });

    const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
    const csv = lines.join('\n');

    await auditLog({
      actorUserId: user.id,
      action: 'admin.export.members',
      targetType: 'MemberRoster',
      metadata: {
        orgId,
        rowCount: filtered.length,
        truncated: members.length >= MAX_EXPORT,
        filters: {
          search: search || null,
          status: statusFilter || null,
          program: programFilter || null,
          partner: partnerFilter || null,
          health: healthFilter || null,
          notInCourse,
          needsAttention,
          includeStaff,
        },
      },
    });
    await logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'exported',
      object: { type: 'MemberRoster', id: 'members' },
      result: {
        success: true,
        extensions: {
          orgId,
          rowCount: filtered.length,
          truncated: members.length >= MAX_EXPORT,
          filters: {
            search: search || null,
            status: statusFilter || null,
            program: programFilter || null,
            partner: partnerFilter || null,
            health: healthFilter || null,
            notInCourse,
            needsAttention,
            includeStaff,
          },
        },
      },
      request: auditRequestMeta(request),
      orgId,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="members-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('/api/admin/members/export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
