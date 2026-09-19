/** Operational settings share storage, but are not user experiments. */
export const CRON_SETTING_PREFIX = 'cron.enabled:';
export function isOperationalFeatureFlagKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith(CRON_SETTING_PREFIX);
}
