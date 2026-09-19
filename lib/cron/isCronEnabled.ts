import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { CRON_SETTING_PREFIX } from '@/lib/feature-flags/reservedKeys';

type CronSettingsDb = Pick<PrismaClient, 'featureFlag' | 'workflowDiagnostic'>;
export const cronSettingKey = (workflowKey: string): string => `${CRON_SETTING_PREFIX}${workflowKey}`;

/** Persisted operational setting; rollout percentages and user roles do not apply. */
export async function setCronEnabled(
  db: Pick<PrismaClient, 'featureFlag'>,
  workflowKey: string,
  enabled: boolean,
): Promise<void> {
  await db.featureFlag.upsert({
    where: { key: cronSettingKey(workflowKey) },
    create: { key: cronSettingKey(workflowKey), name: `Cron: ${workflowKey}`, enabled },
    update: { enabled },
  });
}

/**
 * Import a retained legacy toggle once, then read the durable setting by key.
 * createMany/skipDuplicates cannot overwrite a concurrent admin toggle.
 * A failed read/import propagates: a disabled job must not silently run.
 */
export async function loadCronEnabledStates(
  workflowKeys: readonly string[],
  db: CronSettingsDb = prisma,
): Promise<Map<string, boolean>> {
  const uniqueKeys = [...new Set(workflowKeys)];
  if (uniqueKeys.length === 0) return new Map();
  const flags = await db.featureFlag.findMany({
    where: { key: { in: uniqueKeys.map(cronSettingKey) } },
    select: { key: true, enabled: true },
  });
  const states = new Map(flags.map((flag) => [flag.key, flag.enabled]));
  const missing = uniqueKeys.filter((key) => !states.has(cronSettingKey(key)));
  if (missing.length) {
    const imports = await Promise.all(missing.map(async (workflow) => {
      const legacy = await db.workflowDiagnostic.findFirst({
        where: {
          workflow,
          AND: [
            { OR: [
              { method: { in: ['admin_toggle', 'admin_activate_all'] } },
              { summary: { contains: 'toggled' } },
            ] },
            { OR: [
              { metadata: { path: ['enabled'], equals: true } },
              { metadata: { path: ['enabled'], equals: false } },
            ] },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { metadata: true },
      });
      const metadata = legacy?.metadata as { enabled?: boolean } | null;
      return { key: cronSettingKey(workflow), name: `Cron: ${workflow}`, enabled: metadata?.enabled !== false };
    }));
    await db.featureFlag.createMany({ data: imports, skipDuplicates: true });
    const persisted = await db.featureFlag.findMany({
      where: { key: { in: missing.map(cronSettingKey) } },
      select: { key: true, enabled: true },
    });
    for (const flag of persisted) states.set(flag.key, flag.enabled);
  }
  return new Map(uniqueKeys.map((workflow) => {
    const enabled = states.get(cronSettingKey(workflow));
    if (enabled === undefined) throw new Error('Cron setting could not be loaded');
    return [workflow, enabled];
  }));
}

export async function isCronEnabled(workflowKey: string): Promise<boolean> {
  return (await loadCronEnabledStates([workflowKey])).get(workflowKey)!;
}
