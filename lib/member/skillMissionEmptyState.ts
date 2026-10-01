import type { KitEmptyKind } from '@/components/portal/kit/KitEmptyState';
import type { KitTone } from '@/components/portal/kit/tokens';

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

export function skillMissionEmptyState(args: {
  programSlug: string | null;
  programTitle: string | null;
}): SkillMissionEmptyState {
  if (args.programSlug) {
    const name = args.programTitle?.trim() || 'this program';
    return {
      kind: 'unavailable',
      tone: 'info',
      title: `No missions for ${name} yet`,
      description: 'No catalog missions for this program yet.',
      primaryAction: { href: '/dashboard/program', label: 'Continue training' },
    };
  }

  return {
    kind: 'first',
    title: 'No program enrolled',
    description: 'Enroll in a program to see missions.',
    primaryAction: { href: '/dashboard/program', label: 'Choose program' },
  };
}
