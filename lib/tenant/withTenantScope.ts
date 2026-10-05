import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import {
  makeScopedProxy,
  TenantScopeViolation,
  TENANT_SCOPED_MODELS,
  PARENT_FK_SCOPED_MODELS,
} from './scopeProxy';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.1)
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 *
 * `withTenantScope(orgId, fn)` is the **primary defense** against cross-
 * tenant data leaks. Every API endpoint that reads or writes tenant data
 * must wrap its Prisma calls in this helper.
 *
 * What it does:
 *   - Wraps the real Prisma client in a Proxy (see `scopeProxy.ts` for
 *     pure logic) that, for tenant-scoped models, auto-injects
 *     `where: { organizationId: orgId }` on read operations
 *   - Asserts at runtime that any explicit `organizationId` in the
 *     caller's `where` matches the scoped value — fails loudly with
 *     `TenantScopeViolation` if a caller tries to override
 *   - On writes (create, update, upsert, delete), forces the org id
 *     into `data` / `where` so a malicious or buggy caller can't write
 *     to another tenant
 *
 * Models recognized as tenant-scoped (carry `organizationId` directly):
 *   - User
 *   - Partner
 *   - Employer
 *   - Job
 *   - Course
 *   - CourseEnrollment
 *   - OrganizationProgramCatalog
 *   - PreScreeningResponse
 *   - TrainingBillingPacket (J5/J6 invoice packets)
 *
 * Parent-FK models (no `organizationId` column) are also scoped:
 *   - Application, PlacementRecord, CourseProgress via `user.organizationId`
 *     on WhereInput ops; **create** verifies the parent user belongs to
 *     the active org (`assertSameTenant` equivalent)
 *   - MessageThread via member / employer / partner `organizationId`
 *
 * Caveats:
 *   - This helper is the application layer of defense. Sprint A.3 adds
 *     Postgres RLS as a backstop.
 *   - Raw SQL (`prisma.$queryRaw`) is NOT auto-scoped — those queries
 *     must manually include the tenant filter and get reviewed in PR.
 *   - Other tables still pass through unchanged. Reviewers should still
 *     confirm those queries are scoped via parent FK.
 */

type ScopedClient = Omit<typeof prisma, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>;

/**
 * Run `fn` with a Prisma client whose tenant-scoped operations are
 * forcibly filtered/written against `orgId`.
 * Pass the active transaction as `client` when the operation must share
 * its row locks and commit/rollback boundary. The default is the app client.
 */
export async function withTenantScope<T>(
  orgId: string,
  fn: (db: ScopedClient) => Promise<T>,
  client: ScopedClient = prisma,
): Promise<T> {
  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
    throw new Error('[tenant-scope] orgId required');
  }
  const scoped = makeScopedProxy(orgId, client);
  return fn(scoped);
}

/**
 * Resolves the signed-in user's home organization and runs `fn` with a
 * tenant-scoped client for that org. Prefer this in authenticated routes
 * so reads/writes cannot accidentally use `getDefaultOrganizationId()` and
 * leak another tenant after multi-org goes live.
 */
export async function withActorTenantScope<T>(
  actorUserId: string,
  fn: (db: ScopedClient) => Promise<T>,
): Promise<T> {
  const orgId = await getActorOrganizationId(actorUserId);
  return withTenantScope(orgId, fn);
}

/**
 * Tag for raw SQL queries that intentionally cross tenants — wrap them in
 * `crossTenantOK()` to make the choice explicit and reviewable. Doesn't do
 * anything functional; it's a marker for the audit script.
 */
export async function crossTenantOK<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

/**
 * Codex P2 catch on PR #1041 (commit 5db07b2bc9): the proxy injects
 * `organizationId` on the row but does NOT verify that scoped foreign-key
 * targets belong to the same tenant. A caller that accepts user-controlled
 * FKs (e.g. `data: { employerId: ??? }` for a Job) can be tricked into
 * creating an Org A row that points at an Org B parent — and any include
 * relations leak the foreign tenant's data.
 *
 * `assertSameTenant` is the per-callsite escape hatch: pass any FK id from
 * the request body and the expected scope, and this verifies the parent's
 * `organizationId` matches before the write. Throws `TenantScopeViolation`
 * if not.
 *
 * The structural fix is Postgres RLS in Sprint A.3 (CHECK constraints +
 * row-level policies enforce same-tenant FKs at the DB layer for free).
 * Until then, every migrated endpoint that accepts a user-controlled FK
 * to a tenant-scoped model must call `assertSameTenant` before the write.
 *
 * See `docs/TENANT-ISOLATION.md` Invariant I-5.
 *
 * @param model — the Prisma delegate name (e.g. 'employer', 'user'). Must
 *                be one of TENANT_SCOPED_MODELS.
 * @param id — the FK value (typically request-controlled).
 * @param expectedOrgId — the active tenant scope (typically the actor's).
 */
export async function assertSameTenant(
  model: keyof typeof prisma,
  id: string,
  expectedOrgId: string,
): Promise<void> {
  if (!TENANT_SCOPED_MODELS.has(String(model))) {
    throw new Error(
      `[tenant-scope] assertSameTenant called with non-tenant-scoped model "${String(model)}"`,
    );
  }
  if (!id || !expectedOrgId) {
    throw new Error('[tenant-scope] assertSameTenant requires id and expectedOrgId');
  }
  // Use the unscoped client so we can read the parent's actual organizationId
  // even if it differs from the active scope (we *want* to detect that case).
   
  const delegate = (prisma as any)[model];
  if (!delegate || typeof delegate.findUnique !== 'function') {
    throw new Error(`[tenant-scope] assertSameTenant: unknown delegate "${String(model)}"`);
  }
  const row = await delegate.findUnique({
    where: { id },
    select: { organizationId: true },
  });
  if (!row) {
    // Treat missing as a violation — caller passed an id that doesn't exist
    // OR is in another tenant we can't see. Either way, refuse the write.
    // External response must stay a generic 404 in both this case and the
    // cross-tenant case below (see callsites catching TenantScopeViolation)
    // — we don't want to tell a probing attacker whether an id exists at
    // all. Internally, though, log the two cases with distinct tags so
    // security monitoring can tell "genuine 404" apart from "someone is
    // enumerating another tenant's ids" — the latter is a much stronger
    // signal and looks identical to a 404 from the caller's point of view.
    console.warn('[tenant-scope] not_found', {
      event: 'not_found',
      model: String(model),
      operation: 'assertSameTenant',
      id,
      expectedOrgId,
    });
    throw new TenantScopeViolation(String(model), 'assertSameTenant', expectedOrgId, 'not-found');
  }
  if (row.organizationId !== expectedOrgId) {
    console.warn('[tenant-scope] cross_tenant_fk_probe', {
      event: 'cross_tenant_fk_probe',
      model: String(model),
      operation: 'assertSameTenant',
      id,
      expectedOrgId,
      actualOrgId: row.organizationId,
    });
    throw new TenantScopeViolation(
      String(model),
      'assertSameTenant',
      expectedOrgId,
      String(row.organizationId),
    );
  }
}

// ─── FK-scoped where helpers (models without direct organizationId) ───

/** Build a where clause for models scoped through `User.organizationId`. */
export function memberInOrg(orgId: string) {
  return { user: { organizationId: orgId } };
}

/** Build a where clause for `Counselor` (scoped through `user`). */
export function counselorInOrg(orgId: string) {
  return { user: { organizationId: orgId } };
}

/** Build a where clause for `Invitation` (scoped through `invitedBy`). */
export function invitationInOrg(orgId: string) {
  return { invitedBy: { organizationId: orgId } };
}

/** Build a where clause for `Subgroup` (scoped through `leader`). */
export function subgroupInOrg(orgId: string) {
  return { leader: { organizationId: orgId } };
}

// Re-exports for convenience.
export { TenantScopeViolation, TENANT_SCOPED_MODELS, PARENT_FK_SCOPED_MODELS, Prisma };
