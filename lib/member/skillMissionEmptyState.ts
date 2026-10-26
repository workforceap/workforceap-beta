import type { KitEmptyKind } from '@/components/portal/kit/KitEmptyState';
import type { KitTone } from '@/components/portal/kit/tokens';

/**
 * Translator for the `skillMissions` message namespace: pass the result of
 * next-intl's `getTranslations('skillMissions')` (server) or
 * `useTranslations('skillMissions')` (client). Copy lives in messages/*.json.
 */
export type SkillMissionTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Empty-state copy for Skill Missions when there is no summary to render.
 *
 * `loadSkillMissionSummary` returns null when the member has no active
 * program (`first`: the first step is choosing one), or when the active
 * program has no catalog missions yet (`unavailable`: nothing the member can
 * do about it, so keep training). Do not tell an already-enrolled member to
 * "choose a program" — that is the wrong next step.
 */
export type SkillMissionEmptyState = {
  kind: KitEmptyKind;
  tone?: KitTone;
  title: string;
  description: string;
  primaryAction: { href: string; label: string };
};

export function skillMissionEmptyState(
  args: {
    programSlug: string | null;
    programTitle: string | null;
  },
  t: SkillMissionTranslate,
): SkillMissionEmptyState {
  if (args.programSlug) {
    const name = args.programTitle?.trim() || t('empty.unavailableNameFallback');
    return {
      kind: 'unavailable',
      tone: 'info',
      title: t('empty.unavailableTitle', { name }),
      description: t('empty.unavailableBody'),
      primaryAction: { href: '/dashboard/program', label: t('empty.unavailableCta') },
    };
  }

  return {
    kind: 'first',
    title: t('empty.noProgramTitle'),
    description: t('empty.noProgramBody'),
    primaryAction: { href: '/dashboard/program', label: t('empty.noProgramCta') },
  };
}

/**
 * The one contextual sentence under the Skill missions title. Counts come
 * from the member's own summary; nothing here predicts an outcome.
 */
export function skillMissionHeaderSentence(
  counts: { totalMissions: number; passedCount: number; readyCount: number; retryCount: number } | null,
  t: SkillMissionTranslate,
): string {
  if (!counts || counts.totalMissions <= 0) return t('lede');
  const { totalMissions: total, passedCount: passed, readyCount: ready, retryCount: retry } = counts;
  if (passed >= total) return t('header.allPassed', { passed, total });
  if (ready > 0) return t('header.ready', { passed, total, ready });
  if (retry > 0) return t('header.retry', { passed, total, retry });
  return t('header.next', { passed, total });
}
