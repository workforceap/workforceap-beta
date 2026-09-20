import { prisma } from '@/lib/db/prisma';
import { getProfileRole, getUserRoles } from '@/lib/auth/roles';
import { filterVisibleFlags } from './publicApi';
import { isOperationalFeatureFlagKey } from './reservedKeys';

/**
 * Guided tours v2 rollout flag (scratchpad tours/design.md §7). The row is NOT
 * created by code or migration; create it once per environment through the
 * admin UI at `/admin/feature-flags` or:
 *
 *   POST /api/admin/feature-flags
 *   { "key": "guided_tours_v2", "name": "Guided tours v2",
 *     "description": "Per-persona first-login tours + Help menu",
 *     "enabled": true, "rolloutPercentage": 100, "allowedRoles": ["wap_staff"] }
 *
 * Widen `allowedRoles` per wave (counselor → admin → member → employer/partner);
 * an empty list means every role. Until the row exists this returns false.
 */
export const GUIDED_TOURS_V2_FLAG = 'guided_tours_v2';

/** Same role set `GET /api/feature-flags` evaluates: profile role + user_roles. */
async function resolveUserFlagRoles(userId: string): Promise<string[]> {
  const [profileRole, userRoles] = await Promise.all([
    getProfileRole(userId).catch(() => 'member'),
    getUserRoles(userId),
  ]);
  return Array.from(new Set([profileRole, ...userRoles]));
}

/**
 * Server-side per-user feature-flag check. Wraps `filterVisibleFlags` (the
 * public API's role + deterministic rollout-bucket logic) so a route or server
 * component can gate on a flag without the client round trip. Operational
 * `cron.enabled:*` keys are never user flags and always return false.
 */
export async function isFlagEnabledForUser(
  flagKey: string,
  userId: string,
  options: { roles?: string[] } = {},
): Promise<boolean> {
  if (!flagKey || isOperationalFeatureFlagKey(flagKey)) return false;
  const flag = await prisma.$transaction((tx) => tx.featureFlag.findUnique({ where: { key: flagKey } }));
  if (!flag || !flag.enabled) return false;
  const roles = options.roles ?? (await resolveUserFlagRoles(userId));
  return filterVisibleFlags([flag], userId, roles).length > 0;
}
