/**
 * Hide obvious sandbox / demo employers from the public job board.
 * Applied in GET /api/dashboard/jobs and the member jobs SSR path.
 *
 * Keep this list narrow (exact names + clear prefixes). Over-broad matches
 * can hide real employers; under-matching can leak QA/seed fixtures to members.
 */
const EXCLUDED_EMPLOYER_NAMES = [
  'test',
  'test students',
  'capital area employer network',
  'qa employer co',
  'demo employer',
  'workforceap example employer',
];
const EXCLUDED_EMPLOYER_PREFIXES = ['test ', 'qa '];
const EXCLUDED_TITLE_PREFIXES = ['[qa]', '[test]', '[demo]', '[preview]'];

export function isExcludedPublicEmployerName(companyName: string | null | undefined): boolean {
  const n = companyName?.trim().toLowerCase() ?? '';
  if (!n) return false;
  return EXCLUDED_EMPLOYER_NAMES.includes(n) || EXCLUDED_EMPLOYER_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * Hide jobs whose title is tagged as a QA / test / seed fixture regardless of employer.
 * Catches stragglers like `[QA] Software Engineer` under an otherwise real employer.
 */
export function isExcludedPublicJobTitle(title: string | null | undefined): boolean {
  const t = title?.trim().toLowerCase() ?? '';
  if (!t) return false;
  return EXCLUDED_TITLE_PREFIXES.some((p) => t.startsWith(p));
}

/**
 * The same exclusions as a Prisma `where`, so a `count()` agrees with the
 * filtered list (WAP-261). Keep the JS predicates on the list as well: they
 * also trim whitespace, which the database filter does not.
 */
export const PUBLIC_JOB_EXCLUSION_WHERE = {
  NOT: [
    ...EXCLUDED_EMPLOYER_NAMES.map((name) => ({
      employer: { companyName: { equals: name, mode: 'insensitive' as const } },
    })),
    ...EXCLUDED_EMPLOYER_PREFIXES.map((prefix) => ({
      employer: { companyName: { startsWith: prefix, mode: 'insensitive' as const } },
    })),
    ...EXCLUDED_TITLE_PREFIXES.map((prefix) => ({
      title: { startsWith: prefix, mode: 'insensitive' as const },
    })),
  ],
};
