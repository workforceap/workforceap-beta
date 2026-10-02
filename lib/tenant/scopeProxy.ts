/**
 * Track A — Tenant Isolation Hardening (Sprint A.1)
 *
 * Pure proxy logic for tenant scoping. Knows nothing about the real
 * Prisma client — caller passes any client-shaped object. This file
 * has no `server-only` import and no Prisma import so it's unit-
 * testable in isolation.
 *
 * Production callers go through `lib/tenant/withTenantScope.ts` which
 * pulls in the real Prisma client and wraps it.
 *
 * Parent-FK models (Application, PlacementRecord, CourseProgress) verify
 * `userId` on create via the unscoped user lookup. Other cross-tenant FKs
 * (e.g. Job.employerId) still need `assertSameTenant` at the callsite.
 * The structural fix is Postgres RLS in Sprint A.3 — see
 * `docs/TENANT-ISOLATION.md` Invariant I-5.
 *
 * See `docs/PROGRAM-ENTERPRISE-GRADE.md` and `docs/TENANT-ISOLATION.md`.
 */

export class TenantScopeViolation extends Error {
  constructor(
    public model: string,
    public operation: string,
    public expectedOrgId: string,
    public providedOrgId: string,
  ) {
    super(
      `[tenant-scope] ${model}.${operation}: caller passed organizationId=${providedOrgId} but tenant scope is ${expectedOrgId}`,
    );
    this.name = 'TenantScopeViolation';
  }
}

/**
 * Models that carry `organizationId` directly. Mirrors the schema audit
 * in `docs/TENANT-ISOLATION.md`. Keep in sync when new tenant-scoped
 * models are added.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'user',
  'partner',
  'employer',
  'job',
  'course',
  'courseEnrollment',
  'organizationProgramCatalog',
  'preScreeningResponse',
  'applyEligibilityScreening',
  'publicWioaScreening',
  'chapter',
  'chapterMember',
  'chapterMeeting',
  'chapterCurriculumItem',
  'trainingBillingPacket',
  'enrollmentAgreementSubmission',
  'enrollmentAgreementOperationLock',
  // Two-stage J5/J6 billing (lib/billing/twoStage, docs/BILLING-PACKETS.md).
  'billingCase',
  'billingAttestation',
  'billingArtifact',
  'billingSignerDelegation',
  'billingStageRecord',
  'billingStageRecipient',
  'billingStageSend',
  'billingDeliveryEvent',
  'billingVoucherReceiptSignature',
  'billingDesignatedSigner',
  'billingSignerSignatureAsset',
  'billingPaymentEvent',
]);

/**
 * Models that inherit tenant via a parent FK (no `organizationId` column).
 *
 * Do NOT add these to `TENANT_SCOPED_MODELS` — injecting a missing
 * `organizationId` scalar 500s. Copied from the tenant-scope provision
 * helper, then tightened:
 *
 * - WhereInput reads/writes (`findMany`, `count`, `updateMany`, …) inject
 *   `user: { organizationId }` (or a member/employer/partner OR).
 * - Unique-where ops (`findUnique`, `update`, `upsert` where, …) are left
 *   alone — Prisma unique inputs cannot take a nested `user` filter.
 * - **create / createMany / upsert.create** look up the parent `userId`
 *   on the unscoped client (`assertSameTenant` equivalent) so an Org A
 *   caller cannot attach a row to an Org B member.
 */
export type ParentFkScope =
  | { kind: 'user' }
  | { kind: 'memberEmployerOrPartner' };

export const PARENT_FK_SCOPED_MODELS: Record<string, ParentFkScope> = {
  application: { kind: 'user' },
  placementRecord: { kind: 'user' },
  courseProgress: { kind: 'user' },
  messageThread: { kind: 'memberEmployerOrPartner' },
};

const PARENT_FK_WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

const PARENT_FK_CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

const READ_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * Wrap any Prisma-shaped client with tenant scoping.
 *
 * @param orgId — the tenant id all queries will be scoped against
 * @param client — the Prisma-like client (real or fake) to wrap
 * @returns a Proxy that forwards everything but interposes on tenant-
 *          scoped models to inject `organizationId` and fail loudly
 *          on cross-tenant attempts.
 */
export function makeScopedProxy<TClient extends object>(orgId: string, client: TClient): TClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') {
        return Reflect.get(target, prop, receiver);
      }
      if (TENANT_SCOPED_MODELS.has(prop)) {
        const model = Reflect.get(target, prop, receiver);
        return wrapModelDelegate(model, prop, orgId);
      }
      const parentScope = PARENT_FK_SCOPED_MODELS[prop];
      if (parentScope) {
        const model = Reflect.get(target, prop, receiver);
        return wrapParentFkDelegate(model, prop, orgId, parentScope, target);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TClient;
}

function wrapModelDelegate(model: unknown, modelName: string, orgId: string): unknown {
  return new Proxy(model as object, {
    get(target, op, receiver) {
      if (typeof op !== 'string') return Reflect.get(target, op, receiver);

      const opName = op;
      const original = Reflect.get(target, op, receiver);
      if (typeof original !== 'function') return original;

      if (READ_OPS.has(opName)) {
        return (args: Record<string, unknown> = {}) => {
          const scopedArgs = enforceReadScope(args, modelName, opName, orgId);
          return (original as (a: unknown) => unknown).call(target, scopedArgs);
        };
      }

      if (WRITE_OPS.has(opName)) {
        return (args: Record<string, unknown> = {}) => {
          const scopedArgs = enforceWriteScope(args, modelName, opName, orgId);
          return (original as (a: unknown) => unknown).call(target, scopedArgs);
        };
      }

      return original;
    },
  });
}

function wrapParentFkDelegate(
  model: unknown,
  modelName: string,
  orgId: string,
  scope: ParentFkScope,
  client: object,
): unknown {
  return new Proxy(model as object, {
    get(target, op, receiver) {
      if (typeof op !== 'string') return Reflect.get(target, op, receiver);

      const opName = op;
      const original = Reflect.get(target, op, receiver);
      if (typeof original !== 'function') return original;

      if (READ_OPS.has(opName) || WRITE_OPS.has(opName)) {
        return (args: Record<string, unknown> = {}) => {
          const scopedArgs = enforceParentFkScope(args, modelName, opName, orgId, scope);
          const pending = maybeAssertParentFkCreate(client, scopedArgs, modelName, opName, orgId, scope);
          return pending.then(() => (original as (a: unknown) => unknown).call(target, scopedArgs));
        };
      }

      return original;
    },
  });
}

function mergeParentFkWhere(
  where: Record<string, unknown>,
  model: string,
  op: string,
  orgId: string,
  scope: ParentFkScope,
): Record<string, unknown> {
  if (scope.kind === 'user') {
    const existing = where.user;
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      const provided = extractOrgId(existing as Record<string, unknown>);
      if (provided !== undefined && provided !== orgId) {
        throw new TenantScopeViolation(model, op, orgId, String(provided));
      }
      return {
        ...where,
        user: { ...(existing as Record<string, unknown>), organizationId: orgId },
      };
    }
    return {
      ...where,
      user: { organizationId: orgId },
    };
  }

  if (scope.kind === 'memberEmployerOrPartner') {
    const extra = {
      OR: [
        { member: { organizationId: orgId } },
        { employer: { organizationId: orgId } },
        { partner: { organizationId: orgId } },
      ],
    };
    const existingAnd = where.AND;
    const andClauses: unknown[] = [];
    if (Array.isArray(existingAnd)) andClauses.push(...existingAnd);
    else if (existingAnd !== undefined) andClauses.push(existingAnd);
    const rest = { ...where };
    delete rest.AND;
    if (Object.keys(rest).length > 0) andClauses.push(rest);
    andClauses.push(extra);
    return { AND: andClauses };
  }

  const _exhaustive: never = scope;
  return _exhaustive;
}

function rejectDirectOrganizationId(
  data: Record<string, unknown> | undefined,
  model: string,
  op: string,
): void {
  if (!data || typeof data !== 'object') return;
  if (data.organizationId !== undefined) {
    throw new TenantScopeViolation(
      model,
      op,
      'parent-fk-has-no-organizationId-column',
      String(data.organizationId),
    );
  }
}

function extractParentUserId(data: Record<string, unknown>): string | undefined {
  if (typeof data.userId === 'string' && data.userId.trim()) return data.userId;
  const user = data.user;
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    const connect = (user as { connect?: { id?: unknown } }).connect;
    if (typeof connect?.id === 'string' && connect.id.trim()) return connect.id;
  }
  return undefined;
}

type UserLookupClient = {
  user?: {
    findUnique?: (args: {
      where: { id: string };
      select: { organizationId: true };
    }) => Promise<{ organizationId?: string } | null>;
  };
};

async function assertUserInOrg(
  client: object,
  userId: string,
  model: string,
  op: string,
  orgId: string,
): Promise<void> {
  const findUnique = (client as UserLookupClient).user?.findUnique;
  if (typeof findUnique !== 'function') {
    throw new Error(`[tenant-scope] ${model}.${op}: parent-FK create requires client.user.findUnique`);
  }
  const row = await findUnique({ where: { id: userId }, select: { organizationId: true } });
  if (!row) {
    throw new TenantScopeViolation(model, op, orgId, 'not-found');
  }
  if (row.organizationId !== orgId) {
    throw new TenantScopeViolation(model, op, orgId, String(row.organizationId ?? 'missing-organizationId'));
  }
}

async function maybeAssertParentFkCreate(
  client: object,
  args: Record<string, unknown>,
  model: string,
  op: string,
  orgId: string,
  scope: ParentFkScope,
): Promise<void> {
  if (scope.kind !== 'user') return;
  if (!PARENT_FK_CREATE_OPS.has(op)) return;

  const rows: Record<string, unknown>[] = [];
  if (op === 'create') {
    rows.push(((args.data ?? {}) as Record<string, unknown>) ?? {});
  } else if (op === 'upsert') {
    rows.push(((args.create ?? {}) as Record<string, unknown>) ?? {});
  } else {
    const dataInput = args.data;
    if (Array.isArray(dataInput)) {
      rows.push(...(dataInput as Array<Record<string, unknown>>));
    } else if (dataInput && typeof dataInput === 'object') {
      rows.push(dataInput as Record<string, unknown>);
    }
  }

  for (const row of rows) {
    const userId = extractParentUserId(row);
    if (!userId) {
      throw new TenantScopeViolation(model, op, orgId, 'missing-parent-userId');
    }
    await assertUserInOrg(client, userId, model, op, orgId);
  }
}

function enforceParentFkScope(
  args: Record<string, unknown>,
  model: string,
  op: string,
  orgId: string,
  scope: ParentFkScope,
): Record<string, unknown> {
  const out = { ...args };

  if (op === 'create') {
    rejectDirectOrganizationId((out.data ?? {}) as Record<string, unknown>, model, op);
    return out;
  }

  if (op === 'createMany' || op === 'createManyAndReturn') {
    const dataInput = out.data;
    if (Array.isArray(dataInput)) {
      for (const row of dataInput as Array<Record<string, unknown>>) {
        rejectDirectOrganizationId(row, model, op);
      }
    } else if (dataInput && typeof dataInput === 'object') {
      rejectDirectOrganizationId(dataInput as Record<string, unknown>, model, op);
    }
    return out;
  }

  if (op === 'upsert') {
    rejectDirectOrganizationId((out.create ?? {}) as Record<string, unknown>, model, op);
    rejectDirectOrganizationId((out.update ?? {}) as Record<string, unknown>, model, op);
    return out;
  }

  if (op === 'update' || op === 'updateMany' || op === 'updateManyAndReturn') {
    rejectDirectOrganizationId((out.data ?? {}) as Record<string, unknown>, model, op);
  }

  if (PARENT_FK_WHERE_OPS.has(op)) {
    const where = (out.where ?? {}) as Record<string, unknown>;
    out.where = mergeParentFkWhere(where, model, op, orgId, scope);
  }

  return out;
}

function enforceReadScope(
  args: Record<string, unknown>,
  model: string,
  op: string,
  orgId: string,
): Record<string, unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;
  const providedOrg = extractOrgId(where);
  if (providedOrg !== undefined && providedOrg !== orgId) {
    throw new TenantScopeViolation(model, op, orgId, String(providedOrg));
  }
  return {
    ...args,
    where: { ...where, organizationId: orgId },
  };
}

function enforceWriteScope(
  args: Record<string, unknown>,
  model: string,
  op: string,
  orgId: string,
): Record<string, unknown> {
  const out = { ...args };

  if (op === 'create') {
    const data = ((out.data ?? {}) as Record<string, unknown>) ?? {};
    assertNoOrganizationRelationWrite(data, model, op);
    const providedOrg = data.organizationId;
    if (providedOrg !== undefined && providedOrg !== orgId) {
      throw new TenantScopeViolation(model, op, orgId, String(providedOrg));
    }
    out.data = { ...data, organizationId: orgId };
    return out;
  }

  if (op === 'upsert') {
    const create = ((out.create ?? {}) as Record<string, unknown>) ?? {};
    assertNoOrganizationRelationWrite(create, model, op);
    const providedCreateOrg = create.organizationId;
    if (providedCreateOrg !== undefined && providedCreateOrg !== orgId) {
      throw new TenantScopeViolation(model, op, orgId, String(providedCreateOrg));
    }
    out.create = { ...create, organizationId: orgId };

    const update = ((out.update ?? {}) as Record<string, unknown>) ?? {};
    assertNoOrganizationRelationWrite(update, model, op);
    // Codex P1 catch on PR #1041 (commit b6a1db4b0a): the upsert.update branch
    // previously skipped the scalar `organizationId` check, so a caller could
    // pass `update: { organizationId: otherOrgId }` and move the row across
    // tenants once the row already existed. Apply the same scalar rejection
    // used in the regular update path.
    if (update.organizationId !== undefined && update.organizationId !== orgId) {
      throw new TenantScopeViolation(model, op, orgId, String(update.organizationId));
    }

    const where = ((out.where ?? {}) as Record<string, unknown>) ?? {};
    const providedWhereOrg = extractOrgId(where);
    if (providedWhereOrg !== undefined && providedWhereOrg !== orgId) {
      throw new TenantScopeViolation(model, op, orgId, String(providedWhereOrg));
    }
    out.where = { ...where, organizationId: orgId };
    return out;
  }

  if (op === 'createMany' || op === 'createManyAndReturn') {
    // `createManyAndReturn` (Prisma 5.14+) takes the same shape as
    // `createMany` and returns the inserted rows. Both must inject
    // `organizationId` into every row.
    //
    // Codex P2 catch on PR #1041 (commit b6a1db4b0a): Prisma 5.22 lets
    // `data` be a SINGLE object as well as an array. The previous code
    // unconditionally cast to an array and called `.map()`, which threw
    // `data.map is not a function` for the single-object form. Normalize
    // both shapes and preserve the original input shape on the way out.
    const dataInput = out.data;
    const scopeRow = (row: Record<string, unknown>): Record<string, unknown> => {
      assertNoOrganizationRelationWrite(row, model, op);
      if (row.organizationId !== undefined && row.organizationId !== orgId) {
        throw new TenantScopeViolation(model, op, orgId, String(row.organizationId));
      }
      return { ...row, organizationId: orgId };
    };
    if (Array.isArray(dataInput)) {
      out.data = (dataInput as Array<Record<string, unknown>>).map(scopeRow);
    } else if (dataInput && typeof dataInput === 'object') {
      out.data = scopeRow(dataInput as Record<string, unknown>);
    } else {
      // No data provided — let Prisma surface the validation error.
      out.data = dataInput;
    }
    return out;
  }

  // update, updateMany, updateManyAndReturn, delete, deleteMany — scope where
  const where = (out.where ?? {}) as Record<string, unknown>;
  const providedOrg = extractOrgId(where);
  if (providedOrg !== undefined && providedOrg !== orgId) {
    throw new TenantScopeViolation(model, op, orgId, String(providedOrg));
  }
  out.where = { ...where, organizationId: orgId };

  if (op === 'update' || op === 'updateMany' || op === 'updateManyAndReturn') {
    const data = ((out.data ?? {}) as Record<string, unknown>) ?? {};
    assertNoOrganizationRelationWrite(data, model, op);
    if (data.organizationId !== undefined && data.organizationId !== orgId) {
      throw new TenantScopeViolation(model, op, orgId, String(data.organizationId));
    }
  }

  return out;
}

/**
 * Reject any nested `organization` relation write in a Prisma data/update
 * input. Codex P1 catch on PR #1041: a caller can do
 *   data: { organization: { connect: { id: otherOrgId } } }
 * and Prisma will move the row to another tenant — the scalar
 * `data.organizationId` check doesn't see it.
 *
 * Strict policy: reject ALL nested `organization` writes (connect, create,
 * update, disconnect, delete, set, upsert). There's no legitimate reason
 * for a tenant-scoped operation to write through this relation. If a
 * cross-tenant operation is genuinely needed, it goes through
 * `crossTenantOK()` with explicit review.
 */
function assertNoOrganizationRelationWrite(
  obj: Record<string, unknown>,
  model: string,
  op: string,
): void {
  if (!('organization' in obj)) return;
  const value = obj.organization;
  // Reject any non-undefined value. Even an empty object would be a Prisma
  // input shape we don't recognize; safer to reject than guess.
  if (value !== undefined) {
    throw new TenantScopeViolation(
      model,
      op,
      'no-relation-writes-allowed',
      JSON.stringify(value),
    );
  }
}

/**
 * Pull `organizationId` out of a where clause if directly present, returning
 * `undefined` otherwise. Doesn't recurse into AND/OR/NOT — by design — because
 * a caller passing `OR: [{ organizationId: A }, { organizationId: B }]` is
 * exactly the cross-tenant escape we want to prevent. Force them to scope at
 * the top level.
 */
function extractOrgId(where: Record<string, unknown>): string | undefined {
  const v = where.organizationId;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    const eq = (v as { equals?: unknown }).equals;
    if (typeof eq === 'string') return eq;
  }
  return undefined;
}
