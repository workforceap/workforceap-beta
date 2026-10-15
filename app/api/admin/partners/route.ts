import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
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
import { enrollPageCopyIsStakeSafe } from '@/lib/enroll/enrollmentCopy';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 1).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * Reads against `Partner` for tenant-listing are wrapped in
 * `withTenantScope` (org filter auto-injected). Writes are also scoped.
 *
 * EXCEPTION: the duplicate-slug / duplicate-referralCode check is run
 * GLOBALLY via `crossTenantOK`. Codex P2 catch on PR #1042 — `slug`
 * and `referralCode` are still `@unique` globally in the schema, so a
 * scoped pre-check would miss collisions in other orgs and the create
 * would then 500 on Prisma's P2002 instead of returning a friendly
 * 400. Once schema migrates to per-tenant uniqueness in Sprint A.3,
 * these checks move back inside `withTenantScope`.
 *
 * The route also catches P2002 as belt-and-braces in case a race
 * slips past the pre-check.
 */

const partnerSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  referralCode: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Referral code must be lowercase letters, numbers, and hyphens only')
    .optional(),
  logoUrl: z.string().url().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  active: z.boolean().optional().default(true),
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

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const orgId = await getActorOrganizationId(user.id);
    const partners = await withTenantScope(orgId, (db) =>
      db.partner.findMany({
        take: 500,
        orderBy: { name: 'asc' },
        include: { _count: { select: { counselors: true, referrals: true } } },
      }),
    );
    return NextResponse.json(partners);
  } catch (error) {
    console.error('/admin/partners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const body = await request.json().catch(() => null);
    const parsed = partnerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  
    const orgId = await getActorOrganizationId(user.id);
    const referralCode = parsed.data.referralCode ?? parsed.data.slug;
  
    // Global uniqueness pre-check — slug and referralCode are @unique across
    // ALL orgs in the current schema. crossTenantOK marks the intentional
    // bypass for the audit script.
    const existingSlug = await crossTenantOK(() =>
      prisma.partner.findUnique({ where: { slug: parsed.data.slug }, select: { id: true } }),
    );
    if (existingSlug) {
      return NextResponse.json({ error: 'A partner with this slug already exists' }, { status: 400 });
    }
  
    const codeTaken = await crossTenantOK(() =>
      prisma.partner.findFirst({
        where: { OR: [{ referralCode }, { slug: referralCode }] },
        select: { id: true },
      }),
    );
    if (codeTaken) {
      return NextResponse.json(
        { error: 'Referral code must be unique and different from other partners slugs' },
        { status: 400 },
      );
    }
  
    const { referralCode: _rc, programSlugs, ...rest } = parsed.data;
    const catalog = validateAdminProgramSlugs(programSlugs, {
      publishing: rest.enrollmentPageEnabled === true,
    });
    if (!catalog.ok) {
      return NextResponse.json({ error: catalog.error }, { status: 400 });
    }

    try {
      const partner = await withTenantScope(orgId, (db) =>
        db.partner.create({
          data: {
            ...rest,
            referralCode,
            organizationId: orgId,
            status: 'active',
            ...sponsorshipStampFields({
              name: rest.name,
              sponsoredEnrollment: rest.sponsoredEnrollment,
              sponsorshipTermLabel: rest.sponsorshipTermLabel,
            }),
          },
        }),
      );
      if (catalog.slugs.length > 0) {
        await withTenantScope(orgId, (db) => syncPartnerProgramCatalog(db, partner.id, catalog.slugs));
      }
      void auditLog({ actorUserId: user.id, action: 'admin_partner_created', targetType: 'User', targetId: user.id, metadata: { partnerId: partner.id, name: partner.name } }).catch(() => {});
      logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'Partner', id: partner.id }, result: { success: true, extensions: { name: partner.name } } }).catch(() => {});
      return NextResponse.json(partner, { status: 201 });
    } catch (error) {
      // Belt-and-braces: catch the unique-constraint race that the
      // global pre-check might miss between check and insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        const targetField = target.join(',');
        if (targetField.includes('slug')) {
          return NextResponse.json({ error: 'A partner with this slug already exists' }, { status: 400 });
        }
        if (targetField.includes('referralCode') || targetField.includes('referral_code')) {
          return NextResponse.json(
            { error: 'Referral code must be unique and different from other partners slugs' },
            { status: 400 },
          );
        }
        return NextResponse.json({ error: 'A partner with these details already exists' }, { status: 400 });
      }
      console.error('[admin/partners POST] error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/partners:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
