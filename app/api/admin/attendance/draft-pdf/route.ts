import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { handleAdminDraftPdf } from '@/lib/attendance/admin-draft';

export const dynamic = 'force-dynamic';

/**
 * Admin-only, organization-scoped draft attendance PDF returned inline.
 * Read-only: one enrollment read, no database write, no storage write.
 * An admin role in the actor's own organization maps to `attendance:admin`.
 */
async function _POST(request: Request) {
  const result = await handleAdminDraftPdf('POST', await request.text(), {
    getUserId: async () => (await getUser())?.id ?? null,
    resolveAdminActor: async (userId) => {
      if (!(await isAdmin(userId))) return null;
      let organizationId: string;
      try { organizationId = await getActorOrganizationId(userId); } catch { return null; }
      return { userId, organizationId, permissions: ['attendance:admin'] };
    },
    loadEnrollment: (organizationId, enrollmentId) => withTenantScope(organizationId, async (db) => {
      const row = await db.courseEnrollment.findFirst({
        where: { id: enrollmentId, organizationId },
        select: { id: true, userId: true, programSlug: true, user: { select: { fullName: true, email: true, phone: true, deletedAt: true, organizationId: true } } },
      });
      if (!row || row.user.organizationId !== organizationId) return null;
      return {
        scope: { organizationId, memberId: row.userId, enrollmentId: row.id },
        active: !row.user.deletedAt,
        profile: { name: row.user.fullName, email: row.user.email, phone: row.user.phone },
        // Only stored fields; everything else stays blank, never inferred.
        enrollment: { program: programDisplayTitle(row.programSlug), twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
        startMonth: null,
        configuredInstructorId: null,
        sourceMappings: [],
      };
    }),
  });
  const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (result.status === 200 && 'pdf' in result) {
    return new NextResponse(Buffer.from(result.pdf), { status: 200, headers: result.headers });
  }
  return NextResponse.json('body' in result ? result.body : { error: 'ERROR' }, { status: result.status, headers });
}
export const POST = withApiGuc(_POST);
