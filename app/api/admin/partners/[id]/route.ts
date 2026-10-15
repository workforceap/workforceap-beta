import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { withTenantScope, crossTenantOK } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { z } from 'zod';
import { syncPartnerProgramCatalog } from '@/lib/partner/syncProgramCatalog';
import {
  sponsorshipStampFields,
  validateAdminProgramSlugs,
} from '@/lib/partner/adminSchoolPartner';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { enrollPageCopyIsStakeSafe } from '@/lib/enroll/enrollmentCopy';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 2).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * Reads/writes against `Partner` are wrapped in `withTenantScope` so the
 * org filter is auto-injected. The `subgroup` writes stay on the regular
 * client because `Subgroup` is not a tenant-scoped model in
 * `TENANT_SCOPED_MODELS` (it inherits its tenant via FK to `Partner`).
 *
 * EXCEPTION: the duplicate-referralCode pre-check runs GLOBALLY via
 * `crossTenantOK` because `referralCode` and `slug` are still `@unique`
 * globally in the schema. A scoped pre-check would miss collisions in
 * other orgs and the update would then 500 on Prisma's P2002 instead of
 * returning a friendly 400. The route also catches P2002 as belt-and-
 * braces in case a race slips past the pre-check. Once schema migrates
 * to per-tenant uniqueness in Sprint A.3, these pre-checks move back
 * inside `withTenantScope`.
 *
 * Transactional note: the original PATCH wrapped partner.update +
 * subgroup.updateMany in a single Prisma transaction. After this
 * migration the partner.update goes through `withTenantScope`
 * (separate connection from the subgroup tx). The subgroup updates
 * stay in their own transaction. This is functionally identical for
 * the success path and slightly less atomic on failure — acceptable
 * because the partner update is gated by uniqueness pre-checks, and
 * the subgroup writes are idempotent.
 */

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  referralCode: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Referral code must be lowercase letters, numbers, and hyphens only')
    .optional(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(5000).optional().nullable(),
  logoUrl: z.string().url().max(2048).optional().nullable(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Brand color must be a 6-digit hex (e.g. #1E3A8A)')
    .optional()
    .nullable(),
  subgroupIds: z.array(z.string().uuid()).optional(),
  partnerType: z.enum(['community', 'referral', 'high_school']).optional(),
  sponsoredEnrollment: z.boolean().optional(),
  sponsorshipFundingSource: z.enum(['GRANT', 'EMPLOYER', 'PARTNER_ORG', 'SELF', 'OTHER']).optional().nullable(),
  sponsorshipTermLabel: z.string().max(40).optional().nullable(),
  enrollmentPageEnabled: z.boolean().optional(),
  enrollmentHeadline: z.string().max(200).refine(enrollPageCopyIsStakeSafe, 'Enrollment headline: use qualifying no-cost wording instead of "free".').optional().nullable(),
  enrollmentBlurb: z.string().max(2000).refine(enrollPageCopyIsStakeSafe, 'Enrollment blurb: use qualifying no-cost wording instead of "free".').optional().nullable(),
  schoolDistrict: z.string().max(200).optional().nullable(),
  programSlugs: z.array(z.string().min(1).max(120)).max(20).optional(),
});

export const PATCH = withApiGuc(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      await requireAdmin(user.id);
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const { id: partnerId } = await params;
    const orgId = await getActorOrganizationId(user.id);
  
    const partner = await withTenantScope(orgId, (db) =>
      db.partner.findFirst({ where: { id: partnerId } }),
    );
    if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
    }
  
    const data = parsed.data;
    const publishing = data.enrollmentPageEnabled ?? partner.enrollmentPageEnabled;
    if (data.programSlugs !== undefined) {
      const catalog = validateAdminProgramSlugs(data.programSlugs, { publishing });
      if (!catalog.ok) {
        return NextResponse.json({ error: catalog.error }, { status: 400 });
      }
    } else if (publishing) {
      const existingCatalog = await withTenantScope(orgId, (db) =>
        db.partnerProgramCatalog.count({ where: { partnerId } }),
      );
      if (existingCatalog === 0) {
        return NextResponse.json(
          { error: 'Pick at least one program before publishing the enrollment page' },
          { status: 400 },
        );
      }
    }

    if (data.referralCode !== undefined) {
      const code = data.referralCode.trim().toLowerCase();
      // Global uniqueness pre-check — `slug` and `referralCode` are
      // `@unique` across ALL orgs in the current schema, so this check
      // must cross tenants. crossTenantOK marks the intentional bypass
      // for the audit script.
      const slugConflict = await crossTenantOK(() =>
        prisma.partner.findFirst({
          where: { slug: code, id: { not: partnerId } },
          select: { id: true },
        }),
      );
      const codeConflict = await crossTenantOK(() =>
        prisma.partner.findFirst({
          where: { referralCode: code, id: { not: partnerId } },
          select: { id: true },
        }),
      );
      if (slugConflict || codeConflict) {
        return NextResponse.json({ error: 'Referral code conflicts with another partner slug or code' }, { status: 400 });
      }
    }
  
    // Check for duplicate contact email if changing — scoped to tenant.
    if (data.contactEmail !== undefined && data.contactEmail) {
      const existing = await withTenantScope(orgId, (db) =>
        db.partner.findFirst({
          where: {
            contactEmail: data.contactEmail!.trim().toLowerCase(),
            id: { not: partnerId },
          },
          select: { id: true },
        }),
      );
      if (existing) {
        return NextResponse.json({ error: 'Another partner already uses this contact email' }, { status: 400 });
      }
    }
  
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.referralCode !== undefined) updateData.referralCode = data.referralCode.trim().toLowerCase();
    if (data.contactName !== undefined) updateData.contactName = data.contactName?.trim() || null;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail?.trim().toLowerCase() || null;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone?.trim() || null;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl?.trim() || null;
    if (data.brandColor !== undefined) updateData.brandColor = data.brandColor?.trim() || null;
    if (data.partnerType !== undefined) updateData.partnerType = data.partnerType;
    if (data.sponsoredEnrollment !== undefined) updateData.sponsoredEnrollment = data.sponsoredEnrollment;
    if (data.sponsorshipFundingSource !== undefined) updateData.sponsorshipFundingSource = data.sponsorshipFundingSource;
    if (data.sponsorshipTermLabel !== undefined) updateData.sponsorshipTermLabel = data.sponsorshipTermLabel?.trim() || null;
    if (data.enrollmentPageEnabled !== undefined) updateData.enrollmentPageEnabled = data.enrollmentPageEnabled;
    if (data.enrollmentHeadline !== undefined) updateData.enrollmentHeadline = data.enrollmentHeadline?.trim() || null;
    if (data.enrollmentBlurb !== undefined) updateData.enrollmentBlurb = data.enrollmentBlurb?.trim() || null;
    if (data.schoolDistrict !== undefined) updateData.schoolDistrict = data.schoolDistrict?.trim() || null;
    const sponsored = data.sponsoredEnrollment ?? partner.sponsoredEnrollment;
    if (sponsored) {
      Object.assign(
        updateData,
        sponsorshipStampFields({
          name: typeof updateData.name === 'string' ? updateData.name : partner.name,
          sponsoredEnrollment: true,
          sponsorshipTermLabel:
            data.sponsorshipTermLabel !== undefined
              ? data.sponsorshipTermLabel
              : partner.sponsorshipTermLabel,
        }),
      );
    }
  
    try {
      if (Object.keys(updateData).length > 0) {
        await withTenantScope(orgId, (db) =>
          db.partner.update({
            where: { id: partnerId },
            data: updateData,
          }),
        );
      }
  
      if (data.programSlugs !== undefined) {
        await withTenantScope(orgId, (db) => syncPartnerProgramCatalog(db, partnerId, data.programSlugs ?? []));
      }

      if (data.subgroupIds !== undefined) {
        // Subgroup is NOT tenant-scoped (inherits via FK to Partner).
        // Run the clear+assign inside its own transaction.
        //
        // Filter the assign-by-id by the partner's organization so an
        // Org A admin can't move Org B subgroups under their own Org A
        // partner (AUDIT §H-T2). Subgroups are tied to a tenant via
        // their `leader.organizationId`; resolve `orgId` from the
        // current scope.
        await prisma.$transaction(async (tx) => {
          await tx.subgroup.updateMany({
            where: { partnerId, type: 'partner' },
            data: { partnerId: null },
          });
          if (data.subgroupIds && data.subgroupIds.length > 0) {
            await tx.subgroup.updateMany({
              where: {
                id: { in: data.subgroupIds },
                type: 'partner',
                leader: { organizationId: orgId },
              },
              data: { partnerId },
            });
          }
        });
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        const targetField = target.join(',');
        if (targetField.includes('referralCode') || targetField.includes('referral_code')) {
          return NextResponse.json({ error: 'Referral code conflicts with another partner slug or code' }, { status: 400 });
        }
        if (targetField.includes('slug')) {
          return NextResponse.json({ error: 'Referral code conflicts with another partner slug or code' }, { status: 400 });
        }
        return NextResponse.json({ error: 'A partner with these details already exists' }, { status: 400 });
      }
      throw error;
    }
  
    const updated = await withTenantScope(orgId, (db) =>
      db.partner.findFirst({
        where: { id: partnerId },
        include: {
          subgroups: { select: { id: true, name: true } },
          _count: { select: { counselors: true, referrals: true } },
        },
      }),
    );
    void auditLog({
      actorUserId: user.id,
      action: 'admin_partner_update',
      targetType: 'partner',
      targetId: partnerId,
      metadata: {},
    }).catch(() => {});
    return NextResponse.json(updated);
  } catch (error) {
    console.error('/admin/partners/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
