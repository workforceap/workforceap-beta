import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { checkCourseraIdentityRateLimit } from '@/lib/rate-limit';
import { mapCourseraIdentityAndProgress } from '@/lib/coursera/mapIdentityAndProgress.server';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications/create';

function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-vercel-forwarded-for') ??
    'unknown'
  );
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export const POST = withApiGuc(async (request: Request) => {
  try {
    // Rate-limit Coursera identity spray (AUDIT §H-S14).
    const { success } = await checkCourseraIdentityRateLimit(getClientIp(request));
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const courseraEmail = normalizeEmail((body as Record<string, unknown>)?.courseraEmail);
    if (!courseraEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courseraEmail)) {
      return NextResponse.json({ error: 'Enter a valid Coursera email address.' }, { status: 400 });
    }
  
    try {
      // Prevent one member from stealing another member's Coursera identity (AUDIT §H-S14).
      const existingMapping = await prisma.$queryRaw<Array<{ userId: string }>>`
        SELECT user_id AS "userId"
        FROM coursera_identity_mappings
        WHERE LOWER(coursera_email) = ${courseraEmail}::text
        LIMIT 1
      `;
      if (existingMapping[0] && existingMapping[0].userId !== user.id) {
        return NextResponse.json({ error: 'This Coursera email is already linked to another account.' }, { status: 409 });
      }

      // AUDIT: member self-claims of a Coursera identity are an outcome-
      // integrity risk for WIOA reporting when the claimed email doesn't
      // belong to the member — a claim would immediately inherit that
      // learner's historical progress through the atomic mapping service.
      // Same-account-email claims (the common case: linking your own
      // Coursera inbox) proceed unchanged. A claim for a DIFFERENT email
      // does NOT create the mapping or run the backfill; it's queued for a
      // staff member to confirm via the existing admin mappings UI
      // (`/admin/coursera?ui=legacy` → "Identity mapping & audit tools",
      // POST /api/admin/coursera/mappings). No schema change: there is no
      // status/verified column on `coursera_identity_mappings` to mark
      // "pending" without a migration, so the gate lives entirely in this
      // route — a task notification + audit log for admins to act on.
      const wapUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, fullName: true, organizationId: true },
      });
      const memberOwnEmail = wapUser?.email?.trim().toLowerCase() || null;
      const isSelfEmailClaim = memberOwnEmail !== null && memberOwnEmail === courseraEmail;

      if (!isSelfEmailClaim) {
        void auditLog({
          actorUserId: user.id,
          action: 'coursera_identity_claim_pending_review',
          targetType: 'User',
          targetId: user.id,
          metadata: { courseraEmail, memberEmail: memberOwnEmail },
        }).catch((auditError) => {
          console.error('[member/coursera/identity] audit log failed:', auditError);
        });

        try {
          const admins = wapUser?.organizationId
            ? await prisma.user.findMany({
                where: {
                  organizationId: wapUser.organizationId,
                  deletedAt: null,
                  profile: { role: { in: ['admin', 'super_admin'] } },
                },
                select: { id: true },
                take: 50,
              })
            : [];
          for (const admin of admins) {
            await createNotification({
              userId: admin.id,
              subjectMemberId: user.id,
              type: 'task_assigned',
              title: 'Coursera identity claim needs review',
              body: `${wapUser?.fullName ?? 'A member'} (${memberOwnEmail ?? 'unknown email'}) claimed the Coursera email ${courseraEmail}, which doesn't match their account email. Review and confirm the link before their historical progress is backfilled.`,
              data: { link: '/admin/coursera?ui=legacy', memberId: user.id, courseraEmail },
            });
          }
        } catch (notifyError) {
          console.error('[member/coursera/identity] admin notification failed:', notifyError);
        }

        return NextResponse.json(
          {
            ok: true,
            pending: true,
            courseraEmail,
            message:
              "That Coursera email doesn't match your account email, so a staff member will review it before we link your Coursera progress.",
          },
          { status: 202 },
        );
      }

      const organizationId = wapUser?.organizationId?.trim();
      if (!organizationId) {
        throw new Error('Member organization is unavailable');
      }

      // The identity mapping and all existing raw Coursera course/badge rows
      // must change ownership in one transaction. If any row is already tied
      // to another member, fail the request instead of committing a split-
      // brain mapping and returning success.
      const linked = await mapCourseraIdentityAndProgress({
        userId: user.id,
        organizationId,
        courseraEmail,
        createdByUserId: user.id,
        source: 'member_self_link',
        notes: 'Saved by member from Training page',
      });

      return NextResponse.json({
        ok: true,
        courseraEmail: linked.mapping?.courseraEmail ?? courseraEmail,
      });
    } catch (error) {
      console.error('[member/coursera/identity] failed to save Coursera email:', error);
      if (error instanceof Error && error.message.includes('different WAP user')) {
        return NextResponse.json(
          { error: 'This Coursera email is already linked to another account.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Unable to save your Coursera email right now.' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/coursera/identity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
