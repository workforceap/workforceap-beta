import 'server-only';

/**
 * The fixed check order every two-stage route runs (docs/BILLING-PACKETS.md,
 * "Two-stage API contract (M3)" §3), and the wrapper that turns thrown
 * ApiErrors, M1 trigger refusals and unexpected errors into the error
 * envelope without ever claiming "nothing happened" after a side effect.
 */
import type { BillingCase } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { canAdminActInSubjectOrganization } from '@/lib/tenant/adminSubjectAccess';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { checkBillingProviderOrg } from '../../providerOrg';
import type { BillingStage } from '../constants';
import { requireMigrationApplied } from './gates';
import type { ApiErrorBody, ErrorCode } from '../dto';
import { ApiError, apiError, errorResponse, json, REFUSED_AFTER_EFFECTS_MESSAGE, requireSameOriginMutation, SideEffects, unexpectedErrorResponse } from './http';

export type TwoStageMember = { id: string; organizationId: string; fullName: string; email: string };

export type TwoStageContext<P> = {
  request: Request;
  params: P;
  user: { id: string };
  superAdmin: boolean;
  /** The actor's own organization (looked up even for a super admin). */
  actorOrgId: string | null;
  member: TwoStageMember;
  billingCase: BillingCase | null;
  effects: SideEffects;
  now: Date;
};

type BaseParams = { id: string; caseId?: string; stage?: string };

async function resolveMember(userId: string, memberId: string, superAdmin: boolean): Promise<{ member: TwoStageMember | null; actorOrgId: string | null }> {
  const subjectOrgId = await getSubjectOrganizationId(memberId).catch(() => null);
  const actorOrgId = await getActorOrganizationId(userId).catch(() => null);
  if (!subjectOrgId || !canAdminActInSubjectOrganization({ actorOrgId: superAdmin ? null : actorOrgId, subjectOrgId, superAdmin })) {
    return { member: null, actorOrgId };
  }
  const member = await withTenantScope(subjectOrgId, (db) =>
    db.user.findFirst({ where: { id: memberId, organizationId: subjectOrgId, deletedAt: null }, select: { id: true, organizationId: true, fullName: true, email: true } }),
  );
  return { member, actorOrgId };
}

export function parseStage(raw: string | undefined): BillingStage {
  if (raw === 'j5' || raw === 'j6') return raw;
  throw apiError(404, 'NOT_FOUND', 'This item was not found.');
}

/** A PostgreSQL CHECK / trigger refusal from M1 (SQLSTATE 23514), as Prisma surfaces it. */
export function isBillingRuleRefusal(error: unknown): error is Error {
  const e = error as { code?: string; meta?: { code?: string }; message?: string } | null;
  return Boolean(e && (e.code === '23514' || e.meta?.code === '23514' || /\b23514\b/u.test(e.message ?? '')));
}

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/**
 * M1 trigger refusals that start with a stable code (`CODE: …`). Each maps to
 * its own route error; any other refusal is BILLING_RULE_REFUSED.
 */
const NAMED_REFUSALS: ReadonlyArray<{ code: ErrorCode; status: number; message: string }> = [
  { code: 'SIGNER_PRINCIPAL_UNSET', status: 503, message: 'No signer principal is designated yet; the voucher receipt attestation and J6 signing and sending stay closed.' },
  { code: 'SIGNER_NOT_DESIGNATED', status: 403, message: 'Only the designated signer can sign a J6.' },
  { code: 'VOUCHER_ATTESTER_NOT_SIGNER', status: 403, message: 'The voucher must be attested by the designated signer who signs this J6.' },
  { code: 'VOUCHER_ATTESTER_NOT_DESIGNATED', status: 403, message: 'Only the designated signer can attest a board-signed voucher.' },
  { code: 'VOUCHER_RECEIPT_SIGNATURE_WRONG_PRINCIPAL', status: 403, message: 'Only the designated signer can attest the receiving signature.' },
  { code: 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED', status: 409, message: 'The designated signer has not attested his receiving signature on this exact voucher.' },
  { code: 'LETTERHEAD_FOOTER_MISMATCH', status: 409, message: 'The document does not print the approved WAP footer. Save the draft again.' },
  { code: 'J5_LINKED_BY_OPEN_J6', status: 409, message: 'An open J6 follows this J5. Void or supersede the J6 first.' },
];

export function namedRefusal(message: string): { code: ErrorCode; status: number; message: string } | null {
  return NAMED_REFUSALS.find((r) => new RegExp(`(^|\\W)${r.code}:`, 'u').test(message)) ?? null;
}

/**
 * Wrap a route. Runs §3 steps 1-8, then `fn`. `mutation` adds the Origin
 * check; `caseRoute` loads the case owned by this member and organization.
 */
export function twoStageRoute<P extends BaseParams>(
  name: string,
  opts: { mutation: boolean; caseRoute: boolean },
  fn: (ctx: TwoStageContext<P>) => Promise<Response>,
): (request: Request, context: { params: Promise<P> }) => Promise<Response> {
  return async (request, context) => {
    const effects = new SideEffects();
    try {
      requireMigrationApplied();
      if (opts.mutation) requireSameOriginMutation(request);
      const user = await getUser();
      if (!user) throw apiError(401, 'UNAUTHENTICATED', 'Sign in again to continue.');
      if (!(await isAdmin(user.id))) throw apiError(403, 'ADMIN_REQUIRED', 'Only administrators can manage J5/J6 billing.');
      const params = await context.params;
      const superAdmin = await isSuperAdmin(user.id);
      const { member, actorOrgId } = await resolveMember(user.id, params.id, superAdmin);
      if (!member) throw apiError(404, 'MEMBER_NOT_FOUND', 'This item was not found.');
      const provider = checkBillingProviderOrg([member.organizationId, ...(superAdmin ? [] : [actorOrgId])]);
      if (!provider.ok) throw apiError(provider.status, provider.status === 503 ? 'PROVIDER_ORG_MISCONFIGURED' : 'PROVIDER_ORG_ONLY', provider.error);
      let billingCase: BillingCase | null = null;
      if (opts.caseRoute) {
        if (!params.caseId) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
        billingCase = await prisma.billingCase.findFirst({ where: { id: params.caseId, organizationId: member.organizationId, memberId: member.id } });
        if (!billingCase) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
      }
      return await fn({ request, params, user: { id: user.id }, superAdmin, actorOrgId, member, billingCase, effects, now: new Date() });
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error);
      if (isBillingRuleRefusal(error)) {
        console.error(`[billing/two-stage ${name}] refused by a billing rule`, (error as Error).message);
        const named = namedRefusal((error as Error).message);
        const code: ErrorCode = named?.code ?? 'BILLING_RULE_REFUSED';
        const status = named?.status ?? 409;
        // The refused transaction rolled back, but an earlier step of this
        // request (a storage write, a provider call, a committed statement)
        // did not: say so instead of implying nothing changed.
        if (effects.anyCommitted) {
          return json<ApiErrorBody>({ code, error: `${named?.message ?? 'The billing records refused this change.'} ${REFUSED_AFTER_EFFECTS_MESSAGE}`, outcomeUncertain: true }, status);
        }
        if (named) return json<ApiErrorBody>({ code: named.code, error: named.message }, named.status);
        return json<ApiErrorBody>({ code: 'BILLING_RULE_REFUSED', error: 'The billing records refused this change. Reload the case and try again.' }, 409);
      }
      return unexpectedErrorResponse(name, error, effects);
    }
  };
}

export function requireCase<P>(ctx: TwoStageContext<P>): BillingCase {
  if (!ctx.billingCase) throw apiError(404, 'CASE_NOT_FOUND', 'This item was not found.');
  return ctx.billingCase;
}
