import { isAdmin } from '@/lib/auth/roles';
import { isFlagEnabledForUser } from '@/lib/feature-flags/isFlagEnabledForUser';
import { logger } from '@/lib/observability/logger';
import { GAME_LAB_FLAG_KEY } from './manifest';

/**
 * The single gate for every Game Lab entry (pages, assets, nav item):
 * authoritative admin role AND the native `admin_game_lab` feature flag.
 * Fails closed: a missing flag row, a lookup error or a thrown role check all
 * return false. The flag row is not created by code, so it is OFF everywhere
 * until someone creates it.
 */
export async function canUseGameLab(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    if (!(await isAdmin(userId))) return false;
    return (await isFlagEnabledForUser(GAME_LAB_FLAG_KEY, userId)) === true;
  } catch (error) {
    logger.warn('game-lab gate failed closed', { error: error instanceof Error ? error.name : 'unknown' });
    return false;
  }
}
