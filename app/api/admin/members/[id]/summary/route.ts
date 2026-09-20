import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { prisma } from '@/lib/db/prisma';
import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';
import { checkAIToolRateLimit } from '@/lib/rate-limit';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { loadMemberProgramTrainingView } from '@/lib/member/memberProgramTrainingView';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { programDisplayTitle } from '@/lib/content/programTitle';

/**
 * POST /api/admin/members/[id]/summary
 *
 * Admin-only. Generates a plain-language "where this student is + what to do
 * next" summary for a single member, so a non-technical program admin doesn't
 * have to scan the full member-detail page.
 *
 * Reuses the shared Groq `chatCompletion` (model-fallback), the `isAdmin`
 * auth guard, and the `withApiGuc` RLS context wrapper used by other admin
 * AI routes.
 */
export const POST = withApiGuc(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    try {
      const user = await getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const hasAdmin = await isAdmin(user.id);
      if (!hasAdmin) {
        return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
      }

      if (!isAIConfigured()) {
        return NextResponse.json(
          { summary: 'Summary unavailable, try again.' },
          { status: 200 }
        );
      }
      const { success: aiRateOk } = await checkAIToolRateLimit(user.id);
      if (!aiRateOk) return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });

      const { id } = await context.params;

      const superAdmin = await isSuperAdmin(user.id);
      const actorOrgId = superAdmin ? null : await getActorOrganizationId(user.id);

      const member = await prisma.$transaction((tx) => tx.user.findUnique({
        where: { id, ...(actorOrgId ? { organizationId: actorOrgId } : {}) },
        select: {
          fullName: true,
          email: true,
          deletedAt: true,
          enrolledProgram: true,
          enrolledAt: true,
          assessmentCompleted: true,
          assessmentScorePct: true,
          wioaReviewStatus: true,
          profile: {
            select: {
              barrierTypes: true,
              employmentStatus: true,
            },
          },
          courseEnrollments: {
            orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
            select: { programSlug: true, curriculumVersion: true, isPrimary: true },
          },
          courseProgress: {
            orderBy: { lastUpdatedAt: 'desc' },
            take: 25,
            select: {
              courseSlug: true,
              status: true,
              percentComplete: true,
              lastUpdatedAt: true,
            },
          },
          placementRecord: {
            select: {
              employerName: true,
              jobTitle: true,
              startDate: true,
              placedAt: true,
            },
          },
        },
      }));

      if (!member || member.deletedAt) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }

      // The facts below must match the member-detail page the admin is looking
      // at. Previously this route picked `memberProgramProgress[0]` with no
      // orderBy (one member has four rollups: 24%, 77%, 6%, 0%) and counted
      // every COMPLETED CourseProgress row across all programs, so the model
      // was told "8 completed" beside a page reading "3 of 17". Reconcile the
      // assigned program exactly as the page does. No B4B map is passed:
      // admin surfaces reconcile local rows only (see audit S28).
      const trainingAssignment = resolveTrainingProgressAssignment(
        member.enrolledProgram,
        member.courseEnrollments ?? [],
      );
      // A failed load must not read as "no course data": the model would then
      // describe a member with real progress as having none.
      let trainingViewLoadFailed = false;
      const trainingView = trainingAssignment.programSlug
        ? await loadMemberProgramTrainingView({
            userId: id,
            programSlug: trainingAssignment.programSlug,
          }).catch((err) => {
            console.error('[admin/member-summary] training view load failed', err);
            trainingViewLoadFailed = true;
            return null;
          })
        : null;

      const assignedProgramSlug = trainingAssignment.programSlug ?? member.enrolledProgram ?? null;
      const lastActivity =
        trainingView?.lastTrainingActivityAt ?? member.courseProgress[0]?.lastUpdatedAt ?? null;

      const facts = [
        `Name: ${member.fullName ?? 'Unknown'}`,
        `Enrolled program: ${assignedProgramSlug ? programDisplayTitle(assignedProgramSlug) : 'None'}`,
        member.enrolledAt ? `Enrolled at: ${member.enrolledAt.toISOString().slice(0, 10)}` : null,
        `Intake assessment completed: ${member.assessmentCompleted ? 'Yes' : 'No'}`,
        member.assessmentScorePct != null
          ? `Assessment score: ${member.assessmentScorePct}%`
          : null,
        trainingView
          ? `Program progress: ${trainingView.completedCount} of ${trainingView.totalCourses} courses complete (${trainingView.progressPercentDisplay}% overall)`
          : trainingViewLoadFailed
            ? 'Program progress: unavailable (progress could not be loaded; do not infer a lack of progress)'
            : assignedProgramSlug
              ? 'Program progress: no course data for the assigned program'
              : null,
        trainingView?.nextIncompleteCourseName
          ? `Next incomplete course: ${trainingView.nextIncompleteCourseName}`
          : null,
        lastActivity
          ? `Last course activity: ${lastActivity.toISOString().slice(0, 10)}`
          : 'Last course activity: none recorded',
        member.courseProgress.length > 0
          ? `Recent course activity (all programs, not a completion total): ${member.courseProgress
              .slice(0, 5)
              .map((c) => `${c.courseSlug} (${c.status}, ${Math.round(c.percentComplete)}%)`)
              .join('; ')}`
          : null,
        `WIOA review status: ${member.wioaReviewStatus ?? 'Not reviewed'}`,
        member.profile?.employmentStatus
          ? `Employment status: ${member.profile.employmentStatus}`
          : null,
        member.profile?.barrierTypes && member.profile.barrierTypes.length > 0
          ? `Reported barriers: ${member.profile.barrierTypes.join(', ')}`
          : 'Reported barriers: none recorded',
        member.placementRecord
          ? `Placement: ${member.placementRecord.jobTitle ?? 'role'} at ${member.placementRecord.employerName ?? 'employer'}${
              member.placementRecord.placedAt
                ? ` (placed ${member.placementRecord.placedAt.toISOString().slice(0, 10)})`
                : ''
            }`
          : 'Placement: not yet placed',
      ]
        .filter(Boolean)
        .join('\n');

      const systemPrompt =
        'You summarize a workforce-development student\'s status for a non-technical program admin. ' +
        '4-6 sentences max, plain English. Cover: where they are (program + progress), ' +
        'engagement/risk, any barriers/WIOA status, and a clear recommended next action. ' +
        'Do not use markdown headers or bullet lists — write a short, readable paragraph.';

      const userPrompt = `Here are this student's current facts:\n\n${facts}\n\nWrite the summary now.`;

      let out: string | null = null;
      try {
        out = await chatCompletion(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { maxTokens: 400, temperature: 0.3 }
        );
      } catch (err) {
        console.error('[admin/member-summary] chatCompletion failed', err);
        out = null;
      }

      void auditLog({ actorUserId: user.id, action: 'admin_member_summary_generated', targetType: 'User', targetId: id, metadata: {} }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'MemberSummary', id }, result: { success: true } }).catch(() => {});
      return NextResponse.json({ summary: out ?? 'Summary unavailable, try again.' });
    } catch (error) {
      console.error('/api/admin/members/[id]/summary:', error);
      return NextResponse.json({ summary: 'Summary unavailable, try again.' }, { status: 500 });
    }
  }
);
