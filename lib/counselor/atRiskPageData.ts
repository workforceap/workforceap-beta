import 'server-only';

import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { loadPersistedAtRiskMembers, type PersistedRiskScope } from '@/lib/member/persistedAtRisk';
import { withSoftTimeout } from '@/lib/admin/withSoftTimeout';
import { toAtRiskMemberRow, type AtRiskMember, type SavedAtRiskCase } from '@/lib/member/atRiskRow';

/**
 * Server-side loader for /counselor/at-risk.
 *
 * The counselor audit (§3 item 3) saw "Loading at-risk members…" forever: the
 * page painted an empty client component that fetched
 * /api/admin/members/at-risk with no timeout and no failure state. The page
 * now loads the same saved cases on the server, scoped exactly as that route
 * scopes them, and hands the rows to the dashboard as initial props.
 *
 * Scope (identical to app/api/admin/members/at-risk GET):
 *   - super admin  → every organization
 *   - admin        → the actor's organization
 *   - counselor    → the actor's organization AND active caseload assignments
 *
 * The caller wraps this in `withAuthGuc` so RLS sees the actor, the same way
 * the API route runs under `withApiGuc`.
 */

/** Matches the client's first request (`limit=100&threshold=0`): every severity, one page. */
export const AT_RISK_PAGE_LIMIT = 100;
export const AT_RISK_PAGE_THRESHOLD = 0;
/** Long enough for the ranked-alerts query on a large org; short enough that a hung pool still paints a page. */
export const AT_RISK_PAGE_TIMEOUT_MS = 20_000;

export const AT_RISK_PAGE_FAILURE = {
  timeout:
    'Loading at-risk members took longer than expected. Nothing has changed on your caseload; try again in a moment.',
  unavailable:
    'We could not load at-risk members right now. Nothing has changed on your caseload; try again in a minute.',
} as const;

export type AtRiskPageLoad =
  | { status: 'ok'; members: AtRiskMember[]; total: number }
  | { status: 'failed'; message: string };

export type AtRiskPageDeps = {
  isSuperAdmin: (userId: string) => Promise<boolean>;
  isAdmin: (userId: string) => Promise<boolean>;
  getActorOrganizationId: (userId: string) => Promise<string>;
  loadPersistedAtRiskMembers: (
    scope: PersistedRiskScope,
    options: { limit: number; threshold: number },
  ) => Promise<{ total: number; rows: SavedAtRiskCase[] }>;
};

const defaultDeps: AtRiskPageDeps = {
  isSuperAdmin,
  isAdmin,
  getActorOrganizationId,
  loadPersistedAtRiskMembers,
};

/** Resolve the saved-case scope for this actor the way the API route does. */
export async function resolveAtRiskPageScope(
  userId: string,
  deps: Pick<AtRiskPageDeps, 'isSuperAdmin' | 'isAdmin' | 'getActorOrganizationId'> = defaultDeps,
): Promise<PersistedRiskScope> {
  if (await deps.isSuperAdmin(userId)) return { platform: true };
  const [organizationId, admin] = await Promise.all([deps.getActorOrganizationId(userId), deps.isAdmin(userId)]);
  return admin ? { organizationId } : { organizationId, counselorUserId: userId };
}

export async function loadCounselorAtRiskPage(
  userId: string,
  deps: AtRiskPageDeps = defaultDeps,
  options: { timeoutMs?: number; onError?: (error: unknown) => void } = {},
): Promise<AtRiskPageLoad> {
  const timeoutMs = options.timeoutMs ?? AT_RISK_PAGE_TIMEOUT_MS;
  const onError = options.onError ?? ((error: unknown) => console.error('[counselor/at-risk] page load failed:', error));
  try {
    const result = await withSoftTimeout(
      (async () => {
        const scope = await resolveAtRiskPageScope(userId, deps);
        return deps.loadPersistedAtRiskMembers(scope, { limit: AT_RISK_PAGE_LIMIT, threshold: AT_RISK_PAGE_THRESHOLD });
      })(),
      timeoutMs,
    );
    return { status: 'ok', members: result.rows.map(toAtRiskMemberRow), total: result.total };
  } catch (error) {
    onError(error);
    const timedOut = error instanceof Error && error.name === 'SoftTimeoutError';
    return { status: 'failed', message: timedOut ? AT_RISK_PAGE_FAILURE.timeout : AT_RISK_PAGE_FAILURE.unavailable };
  }
}
