import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import { formatPhone } from '@/lib/formatPhone';
import { MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { csvEscape } from '@/lib/csv';

const MAX_MEMBERS = 500;

const bodySchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(MAX_MEMBERS),
});

/**
 * One CSV cell through the shared `lib/csv.ts` escaper, which quotes and
 * neutralises a leading `= + - @ TAB CR` so a member-typed value opens in
 * Excel or Sheets as text, not a formula (S01/P02).
 */
function csvCell(value: string | number | null | undefined): string {
  return csvEscape(String(value ?? ''));
}

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { memberIds } = parsed.data;
    const orgId = await getActorOrganizationId(user.id);

    // Fetch members with related data within tenant scope
    const members = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: { id: { in: memberIds }, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          enrolledProgram: true,
          enrolledAt: true,
          assessmentScorePct: true,
          assessmentCompleted: true,
          pipelineBoardStage: true,
          updatedAt: true,
          createdAt: true,
          lastLoginAt: true,
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
            select: { partner: { select: { name: true } } },
          },
          counselorAssignments: {
            where: { active: true },
            take: 1,
            select: {
              counselor: {
                select: {
                  user: { select: { fullName: true } },
                },
              },
            },
          },
        },
      }),
    );

    if (members.length === 0) {
      return NextResponse.json({ error: 'No valid members found' }, { status: 404 });
    }

    // Get program progress for all members
    const memberIdsList = members.map((m) => m.id);
    const programProgress = await prisma.memberProgramProgress.findMany({
      where: { userId: { in: memberIdsList } },
      select: {
        userId: true,
        programSlug: true,
        averagePercent: true,
        coursesCompleted: true,
      },
    });
    // Keyed on the canonical slug: rollups are written under alias slugs
    // (comptia-a-plus vs comptia-a-professional-certificate), so an exact-slug
    // lookup missed them (audit 2026-09-20, S17).
    const progressMap = new Map<string, { averagePercent: number; coursesCompleted: number }>();
    for (const p of programProgress) {
      const key = `${p.userId}:${canonicalizeProgramSlug(p.programSlug)}`;
      progressMap.set(key, { averagePercent: p.averagePercent, coursesCompleted: p.coursesCompleted });
    }

    // "Last Activity" = the newest of a member-driven event, a login and a
    // Coursera/course action — the same three signals Health reads. System-sent
    // mail is excluded, so the column no longer prints the last nudge email
    // as activity beside a row the screen marks Inactive.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [lastEvents, courseActivity] = await Promise.all([
      prisma.memberEvent.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIdsList }, createdAt: { gte: thirtyDaysAgo }, ...MEMBER_ACTIVITY_EVENT_WHERE },
        _max: { createdAt: true },
      }),
      prisma.courseProgress.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIdsList } },
        _max: { lastActivityAt: true },
      }),
    ]);
    const lastActivityMap = new Map<string, Date>();
    const noteActivity = (userId: string, at: Date | null | undefined) => {
      if (!at) return;
      const current = lastActivityMap.get(userId);
      if (!current || at > current) lastActivityMap.set(userId, at);
    };
    for (const e of lastEvents) noteActivity(e.userId, e._max.createdAt);
    for (const row of courseActivity) noteActivity(row.userId, row._max.lastActivityAt);
    for (const m of members) noteActivity(m.id, m.lastLoginAt);

    const headers = [
      'ID',
      'Name',
      'Email',
      'Phone',
      'Program',
      'Pipeline Stage',
      'Progress %',
      'Courses Completed',
      'Partner',
      'Counselor',
      'Assessment Score %',
      'Assessment Completed',
      'Employment Status',
      'Education Level',
      'Enrolled At',
      'Last Activity',
      'Last Login',
      'Created At',
    ];

    const rows = members.map((m) => {
      // Resolve the same assignment the roster row shows (primary enrollment
      // first, then an alias-equivalent legacy pointer) instead of the raw
      // `enrolledProgram` column, which is null for members whose program
      // only exists as a CourseEnrollment row — they exported a blank
      // Program / Progress % / Courses Completed (audit 2026-09-20, S17).
      const assignment = resolveTrainingProgressAssignment(m.enrolledProgram, m.courseEnrollments);
      const programSlug = assignment.programSlug
        ? canonicalizeProgramSlug(assignment.programSlug)
        : null;
      const programTitle = programSlug ? programDisplayTitle(programSlug) : '';
      const progress = programSlug
        ? progressMap.get(`${m.id}:${programSlug}`)
        : null;
      const phone = formatPhone(m.profile?.profilePhone ?? m.phone) ?? '';
      const partner = m.partnerReferrals[0]?.partner.name ?? '';
      const counselor = m.counselorAssignments[0]?.counselor.user.fullName ?? '';
      const lastActivity = lastActivityMap.get(m.id)?.toISOString() ?? '';
      const enrolledAt = m.enrolledAt?.toISOString() ?? '';
      const lastLogin = m.lastLoginAt?.toISOString() ?? '';
      const createdAt = m.createdAt.toISOString();

      return [
        m.id,
        m.fullName,
        m.email,
        phone,
        programTitle,
        m.pipelineBoardStage ?? '',
        progress?.averagePercent ?? '',
        progress?.coursesCompleted ?? '',
        partner,
        counselor,
        m.assessmentScorePct ?? '',
        m.assessmentCompleted ? 'Yes' : 'No',
        m.profile?.employmentStatus ?? '',
        m.profile?.educationLevel ?? '',
        enrolledAt,
        lastActivity,
        lastLogin,
        createdAt,
      ];
    });

    const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
    const csv = lines.join('\n');

    await auditLog({
      actorUserId: user.id,
      action: 'bulk_export_members',
      targetType: 'user',
      metadata: { count: members.length },
    });
    logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'exported',
      object: { type: 'MemberBulkExport', id: orgId },
      result: { success: true, extensions: { count: members.length } },
      request: auditRequestMeta(request),
      orgId,
    }).catch(() => {});

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="members-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('/admin/members/bulk-export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
