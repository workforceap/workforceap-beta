import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { checkBillingProviderOrg, getBillingProviderOrgId } from '@/lib/billing/providerOrg';
import { serializeBillingPacket } from '@/lib/billing/packetAccess';
import { parseSignedSnapshot } from '@/lib/billing/packetSnapshot';

/** Recent issued packets whose member account is deleted or has been purged. Admin only. */
export const GET = withApiGuc(async (request: Request) => {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });

  const providerOrgId = getBillingProviderOrgId();
  const superAdmin = await isSuperAdmin(user.id);
  const orgCheck = superAdmin
    ? checkBillingProviderOrg(providerOrgId)
    : checkBillingProviderOrg(providerOrgId, await getActorOrganizationId(user.id).catch(() => null));
  if (!orgCheck.ok) return NextResponse.json({ error: orgCheck.error }, { status: orgCheck.status });

  const url = new URL(request.url);
  const subjectMemberId = url.searchParams.get('subjectMemberId')?.trim();
  const packetNumber = url.searchParams.get('packetNumber')?.trim();
  if ((subjectMemberId && subjectMemberId.length > 128) || (packetNumber && packetNumber.length > 128)) {
    return NextResponse.json({ error: 'Search value is too long' }, { status: 400 });
  }

  const filters = {
    organizationId: providerOrgId!,
    ...(subjectMemberId ? { subjectMemberId } : {}),
    ...(packetNumber ? { packetNumber } : {}),
  };
  const [detached, softDeleted] = await Promise.all([
    prisma.trainingBillingPacket.findMany({
      where: { ...filters, memberId: null },
      include: { sends: true }, orderBy: { createdAt: 'desc' }, take: 50,
    }),
    prisma.trainingBillingPacket.findMany({
      where: { ...filters, member: { deletedAt: { not: null } } },
      include: { sends: true }, orderBy: { createdAt: 'desc' }, take: 50,
    }),
  ]);
  const rows = [...detached, ...softDeleted]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, 50);

  return NextResponse.json({
    packets: rows.map((row) => {
      let memberName: string | null = null;
      try { memberName = parseSignedSnapshot(row.signedSnapshot)?.member.fullName ?? null; } catch { /* Corrupt snapshots stay visible for repair. */ }
      return {
        ...serializeBillingPacket(row),
        subjectMemberId: row.subjectMemberId,
        memberName,
        pdfUrl: `/api/billing-packets/${row.id}/pdf?doc=both`,
      };
    }),
  });
});
