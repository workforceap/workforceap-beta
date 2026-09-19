import { isOperationalFeatureFlagKey } from './reservedKeys';

export function hashStringToBucket(str: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % buckets;
}

export function filterVisibleFlags(
  flags: Array<{ key: string; name: string; description: string | null; enabled: boolean; rolloutPercentage: number; allowedRoles: string[] }>,
  userId: string,
  allRoles: string[]
) {
  return flags.filter((flag) => {
    if (!flag.enabled || isOperationalFeatureFlagKey(flag.key)) return false;

    // Check if user has any of the allowed roles (empty = no restriction)
    if (flag.allowedRoles && flag.allowedRoles.length > 0) {
      const hasAllowedRole = allRoles.some((role) => flag.allowedRoles.includes(role));
      if (!hasAllowedRole) return false;
    }

    // Rollout percentage: deterministically bucket user by userId+key
    const bucket = hashStringToBucket(`${userId}:${flag.key}`, 100);
    return bucket < flag.rolloutPercentage;
  });
}
