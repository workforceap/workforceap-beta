import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { getProgramBySlug } from '@/lib/content/programs';
import { seedOrganizationProgramCatalog } from '@/lib/platform/seedProgramCatalog';
import { getCacheOrFetch, invalidateCache } from '@/lib/cache';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 2).
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * All Prisma reads/writes against `OrganizationProgramCatalog` go
 * through `withTenantScope` so the org filter is auto-injected on
 * reads and the org id is forced into create/update payloads.
 *
 * Codex flagged this as a false-positive on PR #1041's audit script
 * because the manual `where: { organizationId }` filters made it look
 * scoped, but the audit only recognized `withTenantScope` as the
 * scope marker. Migrating to the helper makes the scoping explicit
 * and contractual rather than convention.
 */

const catalogRowSchema = z.object({
  programSlug: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  description: z.string().max(20_000).optional().nullable(),
  category: z.string().min(1).max(100),
  deliveryType: z.enum(['external_lms', 'youtube', 'in_person', 'virtual', 'internal']),
  deliveryUrl: z.string().url().max(2000).optional().nullable(),
  deliveryDetails: z.string().max(20_000).optional().nullable(),
  certifications: z.array(z.string().max(200)).optional().default([]),
  duration: z.string().max(100).optional().nullable(),
  cost: z.number().optional().nullable(),
  certCost: z.number().optional().nullable(),
  bookCost: z.number().optional().nullable(),
  miscCost: z.number().optional().nullable(),
  status: z.enum(['active', 'coming_soon', 'inactive']).optional().default('active'),
  displayOrder: z.number().int().optional().default(0),
  featured: z.boolean().optional().default(false),
  programStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  programEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const organizationId = await getActorOrganizationId(user.id);
    const cacheKey = `programs:list:${organizationId}`;
    const rows = await getCacheOrFetch(
      cacheKey,
      async () => {
        let result = await withTenantScope(organizationId, (db) =>
          db.organizationProgramCatalog.findMany({
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            take: 100,
          }),
        );
        // Auto-seed from static PROGRAMS list if catalog is empty (first load).
        // The seed helper writes via the regular Prisma client (it tags rows
        // with `organizationId` itself); we re-read via the scoped client.
        if (result.length === 0) {
          await seedOrganizationProgramCatalog(organizationId);
          result = await withTenantScope(organizationId, (db) =>
            db.organizationProgramCatalog.findMany({
              orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
              take: 100,
            }),
          );
        }
        return result;
      },
      3600,
    );
    return NextResponse.json({ programs: rows });
  } catch (error) {
    console.error('/admin/programs/catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const body = await request.json().catch(() => null);
    const parsed = catalogRowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
  
    const staticRef = getProgramBySlug(parsed.data.programSlug);
    if (!staticRef) {
      return NextResponse.json(
        { error: 'programSlug must match an existing static program slug (see /programs).' },
        { status: 400 }
      );
    }
    // getProgramBySlug also resolves legacy aliases and titles, but program
    // assignment (PATCH /api/admin/members/[id]/program, bulk-update) only
    // accepts a row with the exact canonical slug. Storing anything else
    // creates an alias-only row the pickers cannot assign (WAP-286).
    if (parsed.data.programSlug !== staticRef.slug) {
      return NextResponse.json(
        { error: `programSlug must be the canonical program slug "${staticRef.slug}".` },
        { status: 400 }
      );
    }
  
    const organizationId = await getActorOrganizationId(user.id);
    try {
      const row = await withTenantScope(organizationId, (db) =>
        db.organizationProgramCatalog.create({
          data: {
            organizationId,
            programSlug: parsed.data.programSlug,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            category: parsed.data.category,
            deliveryType: parsed.data.deliveryType,
            deliveryUrl: parsed.data.deliveryUrl ?? null,
            deliveryDetails: parsed.data.deliveryDetails ?? null,
            certifications: parsed.data.certifications ?? [],
            duration: parsed.data.duration ?? null,
            cost: parsed.data.cost ?? null,
            certCost: parsed.data.certCost ?? null,
            bookCost: parsed.data.bookCost ?? null,
            miscCost: parsed.data.miscCost ?? null,
            status: parsed.data.status ?? 'active',
            displayOrder: parsed.data.displayOrder ?? 0,
            featured: parsed.data.featured ?? false,
            programStartDate: parsed.data.programStartDate
              ? new Date(`${parsed.data.programStartDate}T12:00:00.000Z`)
              : null,
            programEndDate: parsed.data.programEndDate
              ? new Date(`${parsed.data.programEndDate}T12:00:00.000Z`)
              : null,
          },
        }),
      );
      await invalidateCache(`programs:list:${organizationId}*`);
      await invalidateCache(`courses:catalog:${organizationId}*`);
      await auditLog({
        actorUserId: user.id,
        action: 'program_catalog_create',
        targetType: 'organization_program_catalog',
        targetId: row.id,
        metadata: { programSlug: row.programSlug, name: row.name, status: row.status, organizationId },
      });
      return NextResponse.json(row, { status: 201 });
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? (e as { code: string }).code : '';
      if (code === 'P2002') {
        // The unique key on OrganizationProgramCatalog is (organizationId,
        // programSlug) — already per-tenant — so this only fires when the
        // same admin tries to add a duplicate slug to their own org.
        return NextResponse.json({ error: 'A catalog row for this program slug already exists.' }, { status: 400 });
      }
      throw e;
    }
  } catch (error) {
    console.error('/admin/programs/catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const patchSchema = catalogRowSchema.partial().extend({
  id: z.string().uuid(),
});

async function _PATCH(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid body' }, { status: 400 });
    }
  
    const organizationId = await getActorOrganizationId(user.id);
    const { id, ...rest } = parsed.data;
  
    const existing = await withTenantScope(organizationId, (db) =>
      db.organizationProgramCatalog.findFirst({
        where: { id },
      }),
    );
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
    if (rest.programSlug && rest.programSlug !== existing.programSlug) {
      return NextResponse.json({ error: 'programSlug cannot be changed; create a new row instead.' }, { status: 400 });
    }
  
    const row = await withTenantScope(organizationId, (db) =>
      db.organizationProgramCatalog.update({
        where: { id },
        data: {
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.description !== undefined ? { description: rest.description } : {}),
          ...(rest.category !== undefined ? { category: rest.category } : {}),
          ...(rest.deliveryType !== undefined ? { deliveryType: rest.deliveryType } : {}),
          ...(rest.deliveryUrl !== undefined ? { deliveryUrl: rest.deliveryUrl } : {}),
          ...(rest.deliveryDetails !== undefined ? { deliveryDetails: rest.deliveryDetails } : {}),
          ...(rest.certifications !== undefined ? { certifications: rest.certifications } : {}),
          ...(rest.duration !== undefined ? { duration: rest.duration } : {}),
          ...(rest.cost !== undefined ? { cost: rest.cost } : {}),
          ...(rest.certCost !== undefined ? { certCost: rest.certCost } : {}),
          ...(rest.bookCost !== undefined ? { bookCost: rest.bookCost } : {}),
          ...(rest.miscCost !== undefined ? { miscCost: rest.miscCost } : {}),
          ...(rest.status !== undefined ? { status: rest.status } : {}),
          ...(rest.displayOrder !== undefined ? { displayOrder: rest.displayOrder } : {}),
          ...(rest.featured !== undefined ? { featured: rest.featured } : {}),
          ...(rest.programStartDate !== undefined
            ? {
                programStartDate: rest.programStartDate
                  ? new Date(`${rest.programStartDate}T12:00:00.000Z`)
                  : null,
              }
            : {}),
          ...(rest.programEndDate !== undefined
            ? {
                programEndDate: rest.programEndDate
                  ? new Date(`${rest.programEndDate}T12:00:00.000Z`)
                  : null,
              }
            : {}),
        },
      }),
    );
  
    await invalidateCache(`programs:list:${organizationId}*`);
    await invalidateCache(`courses:catalog:${organizationId}*`);
    await auditLog({
      actorUserId: user.id,
      action: 'program_catalog_update',
      targetType: 'organization_program_catalog',
      targetId: id,
      metadata: { programSlug: existing.programSlug, changes: Object.keys(rest), organizationId },
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error('/admin/programs/catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
export const POST = withApiGuc(_POST);
export const PATCH = withApiGuc(_PATCH);
