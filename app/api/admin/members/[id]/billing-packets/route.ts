import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import { getProgramBySlug } from '@/lib/content/programs';
import { createPacketSchema, roundMoney, sumLineItems } from '@/lib/billing/packetSchema';
import { isUniqueViolation, nextPacketNumber } from '@/lib/billing/packetNumber';
import { getPacketNumberPrefix, getTrainingProviderIdentity } from '@/lib/billing/providerIdentity';
import { resolveAssignedCounselorContact, resolveProgramTitle, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { resolveProgramPricing } from '@/lib/billing/packetDefaults';
import { findCoverLetterMismatches, formatMoney, WIOA_ITA_MAX_WITHOUT_EXCEPTION } from '@/lib/billing/packetText';
import { buildSignedSnapshot } from '@/lib/billing/packetSnapshot';

/**
 * J5 invoice + J6 cover letter packets for one member.
 *   GET  -> list (newest first)
 *   POST -> create a signed packet from the admin form
 * Admin only; org admins stay inside their tenant, super-admins may act on
 * the subject tenant (same rule as the member program route).
 */
async function resolveAdminSubject(userId: string, memberId: string) {
  const superAdmin = await isSuperAdmin(userId);
  const subjectOrgId = await getSubjectOrganizationId(memberId).catch(() => null);
  if (!subjectOrgId) return null;
  const actorOrgId = superAdmin ? null : await getActorOrganizationId(userId);
  if (!canAdminActInSubjectOrganization({ actorOrgId, subjectOrgId, superAdmin })) return null;
  const member = await prisma.user.findFirst({
    where: { id: memberId, organizationId: subjectOrgId, deletedAt: null },
    select: { id: true, fullName: true, email: true, organizationId: true },
  });
  return member;
}

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
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

export const POST = withApiGuc(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    const { id } = await params;
    const member = await resolveAdminSubject(user.id, id);
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = createPacketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }
    const input = parsed.data;

    // The program must be one this org can bill for: the static catalog or the
    // organization's own catalog row. The catalog row also prices it.
    const program = getProgramBySlug(input.programSlug);
    const catalogRow = await prisma.organizationProgramCatalog.findFirst({
      where: { organizationId: member.organizationId, programSlug: input.programSlug },
      select: { name: true, cost: true, certCost: true, bookCost: true, miscCost: true },
    });
    if (!program && !catalogRow) {
      return NextResponse.json({ error: 'Unknown program for this organization' }, { status: 400 });
    }
    const programTitle = resolveProgramTitle(input.programSlug, catalogRow?.name);

    const totalAmount = sumLineItems(input.lineItems);
    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'The invoice total must be greater than zero' }, { status: 400 });
    }

    // Sign-time guards. The schema already requires a reviewed approved amount
    // and funding basis, so a $7,500 price-list fallback is never signed unreviewed.
    const funding = input.fundingApproval;
    if (totalAmount > roundMoney(funding.approvedAmount)) {
      return NextResponse.json(
        { error: `The invoice total (${formatMoney(totalAmount)}) is more than the approved amount you recorded (${formatMoney(funding.approvedAmount)}).` },
        { status: 400 },
      );
    }
    if (funding.fundingType === 'wioa_ita' && totalAmount > WIOA_ITA_MAX_WITHOUT_EXCEPTION && !funding.capException) {
      return NextResponse.json(
        { error: `A WIOA ITA invoice above ${formatMoney(WIOA_ITA_MAX_WITHOUT_EXCEPTION)} needs the Board-approved exception recorded before signing.` },
        { status: 400 },
      );
    }
    const letterIssues = findCoverLetterMismatches({
      coverLetterBody: input.coverLetterBody,
      lineItems: input.lineItems,
      billToName: input.billToName,
      referenceNumber: input.referenceNumber,
    });
    if (letterIssues.length > 0) {
      return NextResponse.json(
        { error: `The J6 cover letter does not match the J5 rows: ${letterIssues.join(' ')} Regenerate the letter from the rows or correct it before signing.`, letterIssues },
        { status: 400 },
      );
    }

    const pricing = resolveProgramPricing({ slug: input.programSlug }, catalogRow);
    const counselor = await resolveAssignedCounselorContact(member.id);
    const signedSnapshot = buildSignedSnapshot({
      provider: getTrainingProviderIdentity(),
      member: { fullName: member.fullName, email: member.email },
      programTitle,
      counselorAssigned: Boolean(counselor),
      pricing: { source: pricing.source, defaultTotal: roundMoney(pricing.tuition + pricing.certCost + pricing.bookCost + pricing.miscCost) },
      fundingApproval: funding,
    });
    const now = new Date();
    const prefix = getPacketNumberPrefix();

    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const packetNumber = await nextPacketNumber(tx, { organizationId: member.organizationId, prefix, now });
          return tx.trainingBillingPacket.create({
            data: {
              organizationId: member.organizationId,
              memberId: member.id,
              programSlug: input.programSlug,
              packetNumber,
              status: 'signed',
              invoiceDate: isoToDate(input.invoiceDate),
              dueDate: input.dueDate ? isoToDate(input.dueDate) : null,
              billToName: input.billToName,
              billToAttention: input.billToAttention || null,
              billToAddress: input.billToAddress || null,
              billToEmail: input.billToEmail || null,
              referenceNumber: input.referenceNumber || null,
              lineItems: input.lineItems.map((row) => ({ description: row.description, hours: row.hours ?? null, amount: row.amount })),
              totalAmount,
              coverLetterBody: input.coverLetterBody,
              signerName: input.signerName,
              signerTitle: input.signerTitle,
              signatureImage: input.signatureImage ?? null,
              signedAt: now,
              signedById: user.id,
              signedSnapshot,
            },
          });
        });
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 2) throw err;
      }
    }
    if (!created) return NextResponse.json({ error: 'Could not allocate an invoice number' }, { status: 500 });

    // Dual audit (WAP-18): a signed billing packet is a financial record.
    // Metadata carries identifiers and totals only — bill-to details stay on the packet row.
    void auditLog({
      actorUserId: user.id,
      action: 'admin_billing_packet_create',
      targetType: 'training_billing_packet',
      targetId: created.id,
      metadata: {
        memberId: member.id,
        programSlug: input.programSlug,
        packetNumber: created.packetNumber,
        totalAmount,
        pricingSource: pricing.source,
        fundingType: funding.fundingType,
        orgId: member.organizationId,
      },
    }).catch(() => {});
    void logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'created',
      object: { type: 'TrainingBillingPacket', id: created.id },
      result: { success: true, extensions: { memberId: member.id, programSlug: input.programSlug, totalAmount } },
      request: auditRequestMeta(request),
      orgId: member.organizationId,
    }).catch(() => {});

    return NextResponse.json({ ok: true, packet: serializeBillingPacket(created, programTitle) }, { status: 201 });
  } catch (error) {
    console.error('[admin/members/billing-packets POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
