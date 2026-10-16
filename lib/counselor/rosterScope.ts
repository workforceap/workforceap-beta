/**
 * Admin/super-admin counselor roster scope on `/counselor/students`.
 * Counselors without admin stay on their own caseload (no selector).
 */

export const ROSTER_SCOPE_PARAM = 'scope';

export const ROSTER_SCOPE_ALL = 'all';
export const ROSTER_SCOPE_UNASSIGNED = 'unassigned';
export const ROSTER_SCOPE_MINE = 'mine';

export type RosterScopeKind = 'self' | 'all' | 'unassigned' | 'counselor';

export type ResolvedRosterScope =
  | { kind: 'self' }
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'counselor'; counselorId: string };

const COUNSELOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CounselorScopeOption = {
  value: string;
  label: string;
  count: number;
};

export type AdminRosterScope = Exclude<ResolvedRosterScope, { kind: 'self' }>;

/**
 * Resolve the roster query for an admin viewer. Defaults to `all` so an admin
 * without a counselor row is not stuck on "No counselor record".
 */
export function resolveAdminRosterScope(
  raw: string | string[] | undefined,
  ownCounselorId: string | null,
): AdminRosterScope {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value === ROSTER_SCOPE_ALL) return { kind: 'all' };
  if (value === ROSTER_SCOPE_UNASSIGNED) return { kind: 'unassigned' };
  if (value === ROSTER_SCOPE_MINE && ownCounselorId) {
    return { kind: 'counselor', counselorId: ownCounselorId };
  }
  if (COUNSELOR_ID_RE.test(value)) {
    return { kind: 'counselor', counselorId: value };
  }
  return { kind: 'all' };
}

export function rosterScopeToParam(scope: ResolvedRosterScope, ownCounselorId: string | null): string {
  switch (scope.kind) {
    case 'self':
      return ownCounselorId ?? ROSTER_SCOPE_ALL;
    case 'all':
      return ROSTER_SCOPE_ALL;
    case 'unassigned':
      return ROSTER_SCOPE_UNASSIGNED;
    case 'counselor':
      return ownCounselorId && scope.counselorId === ownCounselorId
        ? ROSTER_SCOPE_MINE
        : scope.counselorId;
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function buildCounselorScopeOptions(input: {
  allCount: number;
  unassignedCount: number;
  ownCounselorId: string | null;
  counselors: Array<{ id: string; fullName: string | null; email: string; assignmentCount: number }>;
}): CounselorScopeOption[] {
  const options: CounselorScopeOption[] = [
    { value: ROSTER_SCOPE_ALL, label: `All counselors [${input.allCount}]`, count: input.allCount },
    {
      value: ROSTER_SCOPE_UNASSIGNED,
      label: `Unassigned [${input.unassignedCount}]`,
      count: input.unassignedCount,
    },
  ];
  if (input.ownCounselorId) {
    const mine = input.counselors.find((c) => c.id === input.ownCounselorId);
    options.push({
      value: ROSTER_SCOPE_MINE,
      label: `My caseload [${mine?.assignmentCount ?? 0}]`,
      count: mine?.assignmentCount ?? 0,
    });
  }
  for (const counselor of input.counselors) {
    if (counselor.id === input.ownCounselorId) continue;
    const name = counselor.fullName?.trim() || counselor.email;
    options.push({
      value: counselor.id,
      label: `${name} [${counselor.assignmentCount}]`,
      count: counselor.assignmentCount,
    });
  }
  return options;
}
