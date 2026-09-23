/**
 * WAP-195: the member home has one implementation (the kit home). The retired
 * `?ui=legacy` home and its `?tab=home|learning|opportunities` switches are
 * old bookmarks now, so `/dashboard` sends them back to the plain home.
 *
 * `?program=<slug>` is a real kit feature (WAP-194: which of the member's own
 * enrollments the home describes), so a well-formed slug survives the
 * redirect. Whether the slug is one of the member's enrollments is decided by
 * the home's loader, which falls back to the primary enrollment; this helper
 * only drops values that could never be a program slug.
 *
 * Pure (no Prisma, no `next/navigation`) so both test lanes can load it.
 */

type SearchParamValue = string | string[] | undefined;

export type DashboardSearchParams = {
  program?: SearchParamValue;
  tab?: SearchParamValue;
  ui?: SearchParamValue;
};

/** Program slugs are lowercase words joined by hyphens (`it-support`, `google-cybersecurity`). */
const PROGRAM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROGRAM_SLUG_MAX_LENGTH = 120;

function first(value: SearchParamValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw : null;
}

/** The `?program=` value the home may keep, or `null` when it is absent or malformed. */
export function wellFormedProgramSlug(value: SearchParamValue): string | null {
  const slug = first(value)?.trim().toLowerCase() ?? '';
  if (!slug || slug.length > PROGRAM_SLUG_MAX_LENGTH) return null;
  return PROGRAM_SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Where `/dashboard` should redirect for these search params, or `null` to
 * render the home. Any `?ui=legacy` or any `?tab=` (even an empty one) is a
 * retired legacy-home switch.
 */
export function legacyDashboardRedirectTarget(params: DashboardSearchParams | null | undefined): string | null {
  if (!params) return null;
  const wantsLegacyUi = first(params.ui)?.trim() === 'legacy';
  const hasTab = params.tab !== undefined;
  if (!wantsLegacyUi && !hasTab) return null;
  const program = wellFormedProgramSlug(params.program);
  return program ? `/dashboard?program=${encodeURIComponent(program)}` : '/dashboard';
}
