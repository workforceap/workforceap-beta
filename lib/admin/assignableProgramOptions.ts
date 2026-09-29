import { getProgramBySlug } from '@/lib/content/programs';

export type AssignableProgramOption = { slug: string; title: string };

export type MemberProgramOption = {
  slug: string;
  name: string;
  status?: string;
  curriculumMigrationPending?: boolean;
};

/**
 * Converts the active tenant catalog into the choices staff may assign.
 *
 * The mutation routes accept only canonical WorkforceAP programs and reject
 * curricula that are paused for a versioned migration. Keeping the picker on
 * the same contract prevents a page-derived or stale option from advertising
 * an assignment the server will refuse.
 */
export function buildAssignableProgramOptions(
  activePrograms: ReadonlyArray<{ slug: string }>,
): AssignableProgramOption[] {
  const bySlug = new Map<string, AssignableProgramOption>();

  for (const row of activePrograms) {
    const program = getProgramBySlug(row.slug);
    if (!program || program.curriculumMigrationPending) continue;
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
 */
export function buildMemberProgramOptions(
  catalogPrograms: ReadonlyArray<{ slug: string; name?: string; status?: string }>,
  currentProgramSlug: string | null,
): MemberProgramOption[] {
  const bySlug = new Map<string, MemberProgramOption>();
  const currentCanonicalSlug = currentProgramSlug
    ? getProgramBySlug(currentProgramSlug)?.slug ?? currentProgramSlug
    : null;

  for (const row of catalogPrograms) {
    const program = getProgramBySlug(row.slug);
    if (!program) continue;

    const curriculumMigrationPending = program.curriculumMigrationPending === true;
    const catalogInactive = Boolean(row.status && row.status !== 'active');
    const isCurrentProgram = program.slug === currentCanonicalSlug;
    if ((curriculumMigrationPending || catalogInactive) && !isCurrentProgram) continue;

    bySlug.set(program.slug, {
      slug: program.slug,
      name: program.title,
      status: row.status,
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
