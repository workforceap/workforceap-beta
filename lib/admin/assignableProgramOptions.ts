import { getProgramBySlug } from '@/lib/content/programs';

export type AssignableProgramOption = { slug: string; title: string };

/**
 * Status shown for a program whose only active tenant catalog row uses a
 * legacy alias slug (for example `ai-professional-developer-certificate-ibm`
 * for the AWS program). The writers (PATCH /api/admin/members/[id]/program,
 * bulk-update) require an exact canonical active row, so the option is shown
 * disabled until the catalog is repaired with a canonical row (WAP-286).
 */
export const CATALOG_REPAIR_STATUS = 'needs catalog repair';

export type MemberProgramOption = {
  slug: string;
  name: string;
  status?: string;
  curriculumMigrationPending?: boolean;
};

/**
 * Converts the active tenant catalog into the choices staff may assign.
 *
 * The mutation routes accept only canonical WorkforceAP programs, require an
 * active catalog row with exactly that canonical slug, and reject curricula
 * that are paused for a versioned migration. Keeping the picker on the same
 * contract prevents a page-derived, stale or alias-only row from advertising
 * an assignment the server will refuse.
 */
export function buildAssignableProgramOptions(
  activePrograms: ReadonlyArray<{ slug: string }>,
): AssignableProgramOption[] {
  const bySlug = new Map<string, AssignableProgramOption>();

  for (const row of activePrograms) {
    const program = getProgramBySlug(row.slug);
    // An alias-only row resolves to a program but is not what the writers accept.
    if (!program || program.curriculumMigrationPending || row.slug !== program.slug) continue;
    bySlug.set(program.slug, { slug: program.slug, title: program.title });
  }

  return [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Builds the single-member picker. Paused curricula are hidden from fresh
 * assignment, but the member's current paused program remains visible and
 * disabled so staff do not lose the historical enrollment context.
 *
 * Labels always come from the canonical static catalog (`PROGRAMS`), matching
 * the bulk picker and `getActivePrograms`. Tenant catalog rows seeded before a
 * program rename keep their old `name` column, so trusting it here showed
 * staff retired titles (for example "Digital Literacy Empowerment Class").
 *
 * An option is active only when the tenant has an active row with exactly the
 * canonical slug, which is what the PATCH route checks. A program whose only
 * active row uses a legacy alias slug is shown disabled as
 * `CATALOG_REPAIR_STATUS`, never as assignable.
 */
export function buildMemberProgramOptions(
  catalogPrograms: ReadonlyArray<{ slug: string; name?: string; status?: string }>,
  currentProgramSlug: string | null,
): MemberProgramOption[] {
  const bySlug = new Map<string, MemberProgramOption>();
  const currentCanonicalSlug = currentProgramSlug
    ? getProgramBySlug(currentProgramSlug)?.slug ?? currentProgramSlug
    : null;

  // Per canonical program: the exact-slug row (at most one per tenant) and
  // whether any alias-slug row is active.
  const byProgram = new Map<string, {
    program: NonNullable<ReturnType<typeof getProgramBySlug>>;
    exact?: { status?: string };
    aliasActive: boolean;
    aliasStatus?: string;
  }>();
  for (const row of catalogPrograms) {
    const program = getProgramBySlug(row.slug);
    if (!program) continue;
    const entry = byProgram.get(program.slug) ?? { program, aliasActive: false };
    const rowActive = !row.status || row.status === 'active';
    if (row.slug === program.slug) entry.exact = { status: row.status };
    else if (rowActive) entry.aliasActive = true;
    else entry.aliasStatus ??= row.status;
    byProgram.set(program.slug, entry);
  }

  for (const { program, exact, aliasActive, aliasStatus } of byProgram.values()) {
    const curriculumMigrationPending = program.curriculumMigrationPending === true;
    const status = exact ? exact.status : aliasActive ? CATALOG_REPAIR_STATUS : aliasStatus;
    const needsRepair = status === CATALOG_REPAIR_STATUS;
    const catalogInactive = Boolean(status && status !== 'active' && !needsRepair);
    const isCurrentProgram = program.slug === currentCanonicalSlug;
    // Paused and inactive programs stay hidden unless current; a program that
    // needs catalog repair stays visible (disabled) so staff can see why.
    if ((curriculumMigrationPending || catalogInactive) && !isCurrentProgram) continue;

    bySlug.set(program.slug, {
      slug: program.slug,
      name: program.title,
      status,
      curriculumMigrationPending,
    });
  }

  // A member whose current program is no longer in the tenant catalog (or no
  // longer in the static catalog at all) still sees it, disabled, instead of
  // the picker silently falling back to "— Select —".
  if (currentProgramSlug && currentCanonicalSlug && !bySlug.has(currentCanonicalSlug)) {
    const currentProgram = getProgramBySlug(currentProgramSlug);
    bySlug.set(currentCanonicalSlug, {
      slug: currentCanonicalSlug,
      name: currentProgram?.title ?? currentProgramSlug,
      status: currentProgram ? 'not in catalog' : 'retired',
      curriculumMigrationPending: currentProgram?.curriculumMigrationPending === true,
    });
  }

  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}
