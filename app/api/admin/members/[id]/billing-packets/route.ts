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
import { createPacketSchema, normalizeFundingReference, roundMoney, sumLineItems } from '@/lib/billing/packetSchema';
import { isUniqueViolation, nextPacketNumber } from '@/lib/billing/packetNumber';
import { getPacketNumberPrefix, getTrainingProviderIdentity } from '@/lib/billing/providerIdentity';
import { resolveAssignedCounselorContact, resolveProgramTitle, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { resolveProgramPricing } from '@/lib/billing/packetDefaults';
import { attestationFingerprint, buildJ6Facts, DRAFT_CURRICULUM_REASON, formatMoney, fundingReviewWarnings, narrativeMoneyViolations } from '@/lib/billing/packetText';
import { isCurriculumOwnerVerified } from '@/shared/programCurricula';
import { freezeLogo, type SignedPacketSnapshot } from '@/lib/billing/packetSnapshot';
import { loadLetterheadLogo } from '@/lib/billing/packetPdf';
import { findBillableEnrollment } from '@/lib/billing/billableEnrollments';
import { checkBillingProviderOrg } from '@/lib/billing/providerOrg';
import { RECONCILE_CLAIMED_MIN_AGE_MS } from '@/lib/billing/sendAttempts';
import { randomUUID } from 'node:crypto';

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

class SupersedeRefusedError extends Error {
  constructor(readonly status: 404 | 409, message: string, readonly code: string) {
    super(message);
  }
}

class DuplicateAttestationError extends Error {
  constructor(readonly packetNumber: string) {
    super('duplicate funding attestation');
  }
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
      include: { sends: true },
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

    // Issuance is limited to the provider org: both the admin's own org
    // (resolved from the session) and the member's org must be it.
    const orgCheck = checkBillingProviderOrg(await getActorOrganizationId(user.id).catch(() => null), member.organizationId);
    if (!orgCheck.ok) return NextResponse.json({ error: orgCheck.error }, { status: orgCheck.status });

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
    const supersedesPacketId = input.supersedesPacketId ?? null;
    if (supersedesPacketId && (input.supersedeReason ?? '').length < 3) {
      return NextResponse.json({ error: 'Give a reason for superseding the signed packet.' }, { status: 400 });
    }

    // The program must be one of the member's billable enrollments in this org
    // (aliases accepted), not just any catalog program.
    const enrollment = await findBillableEnrollment(member.id, member.organizationId, input.programSlug);
    if (!enrollment) {
      return NextResponse.json({ error: 'The member is not enrolled in that program in this organization.' }, { status: 422 });
    }
    const programSlug = enrollment.programSlug;
    const program = getProgramBySlug(programSlug);
    const catalogRow = await prisma.organizationProgramCatalog.findFirst({
      where: { organizationId: member.organizationId, programSlug },
      select: { name: true, cost: true, certCost: true, bookCost: true, miscCost: true },
    });
    if (!program && !catalogRow) {
      return NextResponse.json({ error: 'Unknown program for this organization' }, { status: 400 });
    }
    // Fail closed on unverified curricula (same predicate as the price list).
    if (!isCurriculumOwnerVerified(program?.curriculum)) {
      return NextResponse.json({ error: DRAFT_CURRICULUM_REASON, code: 'draft_curriculum' }, { status: 422 });
    }
    const programTitle = resolveProgramTitle(programSlug, catalogRow?.name);
    const pricing = resolveProgramPricing({ slug: programSlug }, catalogRow);

    // No catalog or syllabus price: the form leaves tuition empty, and a row
    // may not be signed at zero; $7,500 is a ceiling, not a charge.
    if (pricing.source === 'price_list_default' && input.lineItems.some((row) => !(row.amount > 0))) {
      return NextResponse.json(
        { error: 'No catalog or syllabus price is on file for this program. Enter the approved tuition for every row before signing.' },
        { status: 400 },
      );
    }
    const totalAmount = sumLineItems(input.lineItems);
    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'The invoice total must be greater than zero' }, { status: 400 });
    }
    // The narrative is human-reviewed prose; money may only appear in the generated facts block.
    const narrativeViolations = narrativeMoneyViolations(input.coverLetterBody);
    if (narrativeViolations.length > 0) {
      return NextResponse.json({ error: narrativeViolations.join(' '), code: 'narrative_money' }, { status: 400 });
    }
    const funding = input.fundingAttestation;
    if (totalAmount > roundMoney(funding.approvedAmount)) {
      return NextResponse.json(
        { error: `The invoice total (${formatMoney(totalAmount)}) is more than the approved amount you recorded (${formatMoney(funding.approvedAmount)}).` },
        { status: 400 },
      );
    }
    // The confirmations must be for exactly the values being signed.
    const fingerprint = attestationFingerprint({
      programSlug: input.programSlug,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate ?? null,
      billToName: input.billToName,
      referenceNumber: input.referenceNumber,
      lineItems: input.lineItems,
      fundingBasis: funding.fundingBasis,
      approvedAmount: funding.approvedAmount,
      fundingReference: funding.reference,
      exceptionNote: funding.exceptionNote,
      narrative: input.coverLetterBody,
    });
    if (fingerprint !== input.reviewedFingerprint) {
      return NextResponse.json(
        { error: 'The invoice or funding values changed after you confirmed them. Review and confirm again before signing.', code: 'stale_attestation' },
        { status: 409 },
      );
    }

    // One signed packet per member per approval (funding basis + normalized
    // reference) until void/supersede or a cumulative-balance design exists.
    // Different members may share a cohort contract reference.
    const fundingAttestationKey = `${funding.fundingBasis}:${normalizeFundingReference(funding.reference)}`;
    const duplicateResponse = (packetNumber: string) =>
      NextResponse.json(
        {
          error: `Invoice ${packetNumber} is already signed for this member against ${funding.fundingBasis === 'wioa_ita' ? 'ITA' : 'contract'} reference "${funding.reference}". Repeat or installment billing for the same member and approval is not supported until void/supersede or a cumulative-balance design exists.`,
          code: 'duplicate_reference',
        },
        { status: 409 },
      );

    const warnings = fundingReviewWarnings({ fundingType: funding.fundingBasis, total: totalAmount });
    const j6Facts = buildJ6Facts({
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate ?? null,
      billToName: input.billToName,
      referenceNumber: input.referenceNumber || null,
      lineItems: input.lineItems.map((row) => ({ description: row.description, hours: row.hours ?? null, amount: row.amount })),
      funding: { fundingType: funding.fundingBasis, approvedAmount: funding.approvedAmount, reference: funding.reference },
    });
    const counselor = await resolveAssignedCounselorContact(member.id);
    const signedSnapshot: SignedPacketSnapshot = {
      version: 1,
      provider: getTrainingProviderIdentity(),
      member: { fullName: member.fullName, email: member.email },
      programSlug,
      programTitle,
      counselor: counselor ? { userId: counselor.userId, fullName: counselor.fullName, email: counselor.email } : null,
      logo: freezeLogo(await loadLetterheadLogo()),
      pricing: { source: pricing.source, priceListMaximum: pricing.source === 'price_list_default' ? pricing.tuition : null },
      fundingAttestation: {
        fundingBasis: funding.fundingBasis,
        approvedAmount: roundMoney(funding.approvedAmount),
        reference: funding.reference,
        reviewed: true,
        tuitionMatches: true,
        staffNotedExceptionUnverified: funding.exceptionNote || null,
        reviewedFingerprint: fingerprint,
      },
      j6: { facts: j6Facts, narrative: input.coverLetterBody, factsReviewed: true },
      warnings,
    };
    const now = new Date();
    const prefix = getPacketNumberPrefix();

    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // Serializes signs for the same member + approval; released at commit.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet:${member.organizationId}:${member.id}:${fundingAttestationKey}`}))`;
          if (supersedesPacketId) {
            // Same lock as sending the old packet, so no provider call can race the supersede.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-packet-send:${supersedesPacketId}`}))`;
            const old = await tx.trainingBillingPacket.findFirst({
              where: { id: supersedesPacketId, organizationId: member.organizationId, memberId: member.id },
              select: { id: true, status: true },
            });
            if (!old) throw new SupersedeRefusedError(404, 'The packet to supersede was not found for this member.', 'not_found');
            if (old.status !== 'signed' && old.status !== 'sent') {
              throw new SupersedeRefusedError(409, 'Only a current signed packet can be superseded.', 'not_supersedable');
            }
            const oldRows = await tx.trainingBillingPacketSend.findMany({ where: { packetId: old.id } });
            // Same window as reconcile: a claimed copy younger than this may still be
            // mid-delivery (up to the provider timeout plus a slow render), and the
            // old packet should not change state under a live send.
            if (oldRows.some((r) => r.status === 'claimed' && now.getTime() - r.lastClaimedAt.getTime() < RECONCILE_CLAIMED_MIN_AGE_MS)) {
              throw new SupersedeRefusedError(409, 'A copy of that packet is being sent right now. Try again in a few minutes.', 'in_progress');
            }
            // Copies never claimed can never go out now: close them as definitely not sent.
            await tx.trainingBillingPacketSend.updateMany({
              where: { packetId: old.id, status: 'pending' },
              data: { status: 'rejected_definite', lastError: 'Not sent: the packet was superseded.', claimToken: randomUUID() },
            });
            const { count } = await tx.trainingBillingPacket.updateMany({
              where: { id: old.id, status: { in: ['signed', 'sent'] } },
              data: { status: 'superseded', supersededAt: now, supersededById: user.id, supersededReason: input.supersedeReason ?? null },
            });
            if (count !== 1) throw new SupersedeRefusedError(409, 'That packet changed meanwhile. Refresh and try again.', 'not_supersedable');
          }
          // A superseded packet is out of the check: it is linked to its
          // replacement (created below), which carries the block from now on.
          const duplicate = await tx.trainingBillingPacket.findFirst({
            where: { organizationId: member.organizationId, memberId: member.id, fundingAttestationKey, status: { in: ['signed', 'sent'] } },
            select: { packetNumber: true },
          });
          if (duplicate) throw new DuplicateAttestationError(duplicate.packetNumber);
          const packetNumber = await nextPacketNumber(tx, { organizationId: member.organizationId, prefix, now });
          const replacement = await tx.trainingBillingPacket.create({
            data: {
              organizationId: member.organizationId,
              memberId: member.id,
              programSlug,
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
              fundingAttestationKey,
              supersedesPacketId,
            },
          });
          if (supersedesPacketId) {
            await tx.trainingBillingPacket.updateMany({ where: { id: supersedesPacketId }, data: { supersededByPacketId: replacement.id } });
          }
          return replacement;
        });
      } catch (err) {
        if (err instanceof DuplicateAttestationError) return duplicateResponse(err.packetNumber);
        if (err instanceof SupersedeRefusedError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
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
        programSlug,
        packetNumber: created.packetNumber,
        totalAmount,
        pricingSource: pricing.source,
        fundingBasis: funding.fundingBasis,
        warnings: warnings.length,
        supersedesPacketId,
        orgId: member.organizationId,
      },
    }).catch(() => {});
    void logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'created',
      object: { type: 'TrainingBillingPacket', id: created.id },
      result: { success: true, extensions: { memberId: member.id, programSlug, totalAmount } },
      request: auditRequestMeta(request),
      orgId: member.organizationId,
    }).catch(() => {});

    return NextResponse.json({ ok: true, packet: serializeBillingPacket(created, programTitle), warnings }, { status: 201 });
  } catch (error) {
    console.error('[admin/members/billing-packets POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
