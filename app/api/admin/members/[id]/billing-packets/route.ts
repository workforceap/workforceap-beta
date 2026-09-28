import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { serializeBillingPacket } from '@/lib/billing/packetAccess';

/**
 * Read-only history for the retired combined J5-invoice/J6-letter packet.
 * New requests use the separate J5 quote and J6 voucher workflow.
 */
async function resolveAdminSubject(userId: string, memberId: string) {
  const superAdmin = await isSuperAdmin(userId);
  const subjectOrgId = await getSubjectOrganizationId(memberId).catch(() => null);
  if (!subjectOrgId) return null;
  const actorOrgId = superAdmin ? null : await getActorOrganizationId(userId);
  if (!canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId, superAdmin })) return null;
  return prisma.user.findFirst({
    where: { id: memberId, organizationId: subjectOrgId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
}

export const GET = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    const { id } = await params;
    const member = await resolveAdminSubject(user.id, id);
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    const rows = await prisma.trainingBillingPacket.findMany({
      where: { memberId: member.id, organizationId: member.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ packets: rows.map((row) => serializeBillingPacket(row)) });
  } catch (error) {
    console.error('[admin/members/billing-packets GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const POST = withApiGuc(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    const { id } = await params;
    const member = await resolveAdminSubject(user.id, id);
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    return NextResponse.json(
      {
        code: 'LEGACY_BILLING_FLOW_RETIRED',
        error: 'The combined J5 invoice and J6 letter workflow has been retired. Use the separate J5 quote and J6 voucher workflow when it is available.',
      },
      { status: 410 },
    );
  } catch (error) {
    console.error('[admin/members/billing-packets POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
