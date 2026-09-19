import { CRON_SETTING_PREFIX, isOperationalFeatureFlagKey } from './reservedKeys';
import { prisma } from '@/lib/db/prisma';

export async function fetchFeatureFlags() {
  return prisma.featureFlag.findMany({
    where: { NOT: { key: { startsWith: CRON_SETTING_PREFIX } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export function validateCreateBody(body: Record<string, unknown>): { error?: string; data?: Record<string, unknown> } {
  const { key, name, description, enabled, rolloutPercentage, allowedRoles } = body;

  if (!key || typeof key !== 'string' || !key.trim() || !name || typeof name !== 'string' || !name.trim()) {
    return { error: 'key and name are required' };
  }

  if (isOperationalFeatureFlagKey(key.trim())) {
    return { error: 'Cron settings must be managed through Email & Cron Management' };
  }

  const rollPct = Math.max(0, Math.min(100, Number(rolloutPercentage) || 0));
  const roles = Array.isArray(allowedRoles)
    ? allowedRoles.filter((r: unknown) => typeof r === 'string') as string[]
    : [];

  return {
    data: {
      key: key.trim(),
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      enabled: !!enabled,
      rolloutPercentage: rollPct,
      allowedRoles: roles,
    },
  };
}
