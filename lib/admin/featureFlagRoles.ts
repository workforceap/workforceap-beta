/** Roles a feature flag can be gated to (`FeatureFlag.allowedRoles`). Empty = everyone. */
export const FEATURE_FLAG_ROLES = [
  'member',
  'admin',
  'super_admin',
  'case_manager',
  'counselor',
  'partner',
  'employer',
] as const;
