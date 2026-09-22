/**
 * Database reads behind the public application-status link (product call 28a).
 *
 * Two entry points, both called under a system GUC context by their routes:
 *
 * - {@link findApplicationForStatusLookup}: the address a visitor typed →
 *   the applicant's newest application, or null. The `users.email` column is
 *   globally unique, so the user lookup is deliberately cross-tenant
 *   (`crossTenantOK`) exactly like /api/apply/signup; every read after that
 *   is scoped to the applicant's OWN organization, never a default org.
 * - {@link loadApplicationForStatusLink}: a verified token → the application
 *   row plus the member facts the dashboard uses to name the stage, or null
 *   when the token's email hash no longer matches the row.
 *
 * Email matching reuses lib/db/exactEmailMatch.ts: Prisma's insensitive
 * `equals` compiles to ILIKE, so `_`/`%` in a visitor-supplied address are
 * wildcards and a match is not proof of identity until the exact filter runs.
 */
import { prisma } from '@/lib/db/prisma';
import { EXACT_EMAIL_CANDIDATE_LIMIT, normalizeEmail, pickExactEmailMatch } from '@/lib/db/exactEmailMatch';
import { crossTenantOK, withTenantScope } from '@/lib/tenant/withTenantScope';
import {
  emailMatchesStatusLink,
  type ApplicationStatusLinkVerifyResult,
} from '@/lib/apply/statusLinkToken';

type StatusLookupMatch = {
  applicationId: string;
  userId: string;
  organizationId: string;
  /** The row's own address (may differ in case from what the visitor typed). */
  email: string;
  fullName: string;
};

export async function findApplicationForStatusLookup(rawEmail: string): Promise<StatusLookupMatch | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  // Cross-tenant by design: `users.email` is unique across the platform and the
  // visitor has not told us which org they applied to. Nothing else here is.
  const candidates = await crossTenantOK(() =>
    prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, email: true, fullName: true, organizationId: true },
      take: EXACT_EMAIL_CANDIDATE_LIMIT,
    }),
  );
  const user = pickExactEmailMatch(candidates, email);
  if (!user) return null;

  // Scoped to the applicant's own org: the proxy injects `user.organizationId`.
  const application = await withTenantScope(user.organizationId, (db) =>
    db.application.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  );
  if (!application) return null;

  return {
    applicationId: application.id,
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
  };
}

export type StatusLinkApplication = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'NEEDS_INFO';
  programInterest: string;
  submittedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
    organizationId: string;
    enrolledProgram: string | null;
    enrolledAt: Date | null;
    assessmentCompleted: boolean;
    counselorAssignments: Array<{ counselor: { user: { fullName: string } } }>;
  };
};

export async function loadApplicationForStatusLink(
  verified: Extract<ApplicationStatusLinkVerifyResult, { ok: true }>,
): Promise<StatusLinkApplication | null> {
  const application = await withTenantScope(verified.organizationId, (db) =>
    db.application.findFirst({
      where: { id: verified.applicationId, user: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        programInterest: true,
        submittedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            organizationId: true,
            enrolledProgram: true,
            enrolledAt: true,
            assessmentCompleted: true,
            // Same shape the member dashboard reads (lib/member/getMemberState.ts).
            counselorAssignments: {
              where: { active: true },
              orderBy: { assignedAt: 'desc' },
              take: 1,
              select: { counselor: { select: { user: { select: { fullName: true } } } } },
            },
          },
        },
      },
    }),
  );
  if (!application) return null;
  // The token was minted for one address. If the account's email changed since,
  // or the token was forged for another application, refuse to render.
  if (!emailMatchesStatusLink(verified.emailHash, application.user.email)) return null;
  return application;
}

/**
 * FIRST name of the active counselor, when one is assigned. A 30-minute
 * link holder is not an authenticated member: the logged-in dashboard shows
 * the full name (#2488), this public page shows only the first name.
 */
export function counselorNameForStatusLink(application: Pick<StatusLinkApplication, 'user'>): string | null {
  const name = application.user.counselorAssignments[0]?.counselor?.user?.fullName?.trim();
  if (!name) return null;
  return name.split(/\s+/)[0] || null;
}
