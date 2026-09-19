/** Context supplied by the apply server wrappers. Referral values come from
 * resolveSchoolApply; a saved browser school name is never a routing authority.
 */
export type ApplyRecoveryContext = { referralRef?: string; programSlug?: string };

export function applyRecoveryHref(
  path: '/apply' | '/apply/results' | '/apply/create-account',
  context?: ApplyRecoveryContext,
): string {
  const params = new URLSearchParams();
  if (context?.referralRef) params.set('ref', context.referralRef);
  if (context?.programSlug) params.set('program', context.programSlug);
  return params.size ? `${path}?${params.toString()}` : path;
}
