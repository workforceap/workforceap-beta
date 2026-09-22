/**
 * Evaluate the subset of a Prisma `where` that the member-population specs
 * produce against a plain fixture row, so a spec can assert on who a query
 * admits instead of on the wording of the filter. Handles scalars, `in` /
 * `notIn` / `not` / `equals`, string `contains` / `startsWith` / `endsWith`,
 * to-one relations (`is`, `null`), to-many relations (`some` / `none`) and
 * the `AND` / `OR` / `NOT` combinators (`NOT` as a list or a single filter).
 */
type RecordValue = Record<string, unknown>;

export function matchesWhere(value: unknown, where: unknown): boolean {
  if (where === null || typeof where !== 'object') return value === where;
  const filters = where as RecordValue;
  if ('equals' in filters) return value === filters.equals;
  if ('contains' in filters) return typeof value === 'string' && value.toLowerCase().includes(String(filters.contains).toLowerCase());
  if ('in' in filters) return (filters.in as unknown[]).includes(value);
  if ('notIn' in filters) return !(filters.notIn as unknown[]).includes(value);
  if ('startsWith' in filters) return typeof value === 'string' && value.startsWith(String(filters.startsWith));
  if ('endsWith' in filters) return typeof value === 'string' && value.endsWith(String(filters.endsWith));
  if ('not' in filters) return !matchesWhere(value, filters.not);
  if ('some' in filters) return Array.isArray(value) && value.some((row) => matchesWhere(row, filters.some));
  if ('none' in filters) return Array.isArray(value) && !value.some((row) => matchesWhere(row, filters.none));
  if ('is' in filters) return matchesWhere(value, filters.is);
  return Object.entries(filters).every(([key, filter]) => {
    // Prisma ignores a key whose value is `undefined`.
    if (filter === undefined) return true;
    if (key === 'AND') return (Array.isArray(filter) ? filter : [filter]).every((entry) => matchesWhere(value, entry));
    if (key === 'OR') return (filter as unknown[]).some((entry) => matchesWhere(value, entry));
    if (key === 'NOT') return !(Array.isArray(filter) ? filter : [filter]).some((entry) => matchesWhere(value, entry));
    // A relation filter on a missing to-one relation matches nothing (Prisma semantics).
    if (value === null || value === undefined) return false;
    return matchesWhere((value as RecordValue)[key], filter);
  });
}

/**
 * One account per branch of the one member definition
 * (lib/admin/memberOnlyWhere.ts), shaped as `prisma.user` rows with the
 * `profile` and `userRoles` relations the role predicate reads.
 */
export const MEMBER_DEFINITION_ROSTER = {
  /** Backfilled: profile and user_roles agree. */
  backfilledMember: { id: 'backfilled', deletedAt: null, profile: { role: 'member' }, userRoles: [{ role: { name: 'member' } }] },
  /** Only `profiles.role = 'member'`; the backfill has not reached it. */
  profileOnlyMember: { id: 'profile-only', deletedAt: null, profile: { role: 'member' }, userRoles: [] },
  /** Only a `member` row in user_roles; no profile row at all. */
  rowOnlyMember: { id: 'row-only', deletedAt: null, profile: null, userRoles: [{ role: { name: 'member' } }] },
  /** A member row with a blank profile role. */
  blankProfileMember: { id: 'blank-profile', deletedAt: null, profile: { role: '' }, userRoles: [{ role: { name: 'member' } }] },
  /** Staff by profile holding the baseline `member` row every account gets. */
  counselorWithBaselineRow: { id: 'counselor', deletedAt: null, profile: { role: 'counselor' }, userRoles: [{ role: { name: 'member' } }, { role: { name: 'counselor' } }] },
  employerWithBaselineRow: { id: 'employer', deletedAt: null, profile: { role: 'employer' }, userRoles: [{ role: { name: 'member' } }] },
  /** Dogfood admin holding the baseline row. */
  adminWithBaselineRow: { id: 'admin', deletedAt: null, profile: { role: 'admin' }, userRoles: [{ role: { name: 'member' } }, { role: { name: 'admin' } }] },
  /** Neither store calls it a member. */
  roleless: { id: 'roleless', deletedAt: null, profile: null, userRoles: [] },
} as const;

/** Ids the strict member definition admits, in roster order. */
export const MEMBER_ONLY_IDS = ['backfilled', 'profile-only', 'row-only', 'blank-profile'] as const;
/** Ids the member-or-dogfood definition admits, in roster order. */
export const MEMBER_OR_DOGFOOD_IDS = [...MEMBER_ONLY_IDS, 'admin'] as const;

/**
 * Ids of the roster rows `where` admits, in roster order. `extra` decorates
 * every row first (an `organizationId` for a tenant-scoped where, say), so a
 * spec can evaluate the exact where a page or route issued.
 */
export function admittedIds(where: unknown, extra: RecordValue = {}): string[] {
  return Object.values(MEMBER_DEFINITION_ROSTER)
    .filter((row) => matchesWhere({ ...row, ...extra }, where))
    .map((row) => row.id);
}
