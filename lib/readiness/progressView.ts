import type { ScoreBreakdown } from '@/lib/readiness/score';

export type ScoreBreakdownKey = keyof ScoreBreakdown;

export type ReadinessCategoryKey = 'resume' | 'training' | 'interview' | 'engagement';

export type ReadinessMilestoneState = 'done' | 'active' | 'goal';

export type ReadinessCategoryItem = {
  key: ScoreBreakdownKey;
  label: string;
  earned: number;
  max: number;
  done: boolean;
};

export type ReadinessCategory = {
  key: ReadinessCategoryKey;
  label: string;
  pct: number;
  earned: number;
  max: number;
  items: ReadinessCategoryItem[];
};

export type ReadinessMilestone = {
  label: string;
  when: 'Complete' | 'In progress' | 'Goal';
  state: ReadinessMilestoneState;
};

export type ReadinessPriorityAction = {
  key: ScoreBreakdownKey;
  label: string;
  href: string;
  ctaLabel: string;
};

export type ReadinessWeekStat = {
  value: string;
  label: string;
  color: string;
};

export type ReadinessProgressView = {
  overallScore: number;
  overallEarned: number;
  overallMax: number;
  categories: ReadinessCategory[];
  weekStats: ReadinessWeekStat[];
  milestones: ReadinessMilestone[];
  priorityAction: ReadinessPriorityAction | null;
  readinessNote: string;
};

/** Member-facing labels for the ten weighted score items. */
export const SCORE_ITEM_LABELS: Record<ScoreBreakdownKey, string> = {
  completeProfile: 'Complete profile',
  setGoals: 'Set goals',
  buildResume: 'Build resume',
  complete2Resources: 'Complete 2 resources',
  practiceInterview: 'Practice interview',
  startPathway: 'Start pathway',
  completePathwaySteps: 'Complete pathway steps',
  addApplications: 'Add applications',
  trackCertifications: 'Track certificates',
  weeklyConsistency: 'Recent activity',
};

/**
 * Highest-impact incomplete item first. Weights match `lib/readiness/score.ts`.
 * Destinations stay on existing member routes — do not retarget training
 * continue-links owned by other in-flight work.
 */
const PRIORITY_ACTIONS: {
  key: ScoreBreakdownKey;
  label: string;
  href: string;
  ctaLabel: string;
}[] = [
  {
    key: 'buildResume',
    label: 'Build or upload your resume to boost your score.',
    href: '/dashboard/profile#resume',
    ctaLabel: 'Open resume',
  },
  {
    key: 'practiceInterview',
    label: 'Practice a mock interview to sharpen your skills.',
    href: '/dashboard/ai-tools/interview-practice',
    ctaLabel: 'Practice interview',
  },
  {
    key: 'addApplications',
    label: 'Apply to at least 3 jobs to show employer readiness.',
    href: '/dashboard/jobs',
    ctaLabel: 'Apply to jobs',
  },
  {
    key: 'completePathwaySteps',
    label: 'Complete more steps on your learning path.',
    href: '/dashboard/learning',
    ctaLabel: 'Open Learning Hub',
  },
  {
    key: 'setGoals',
    label: 'Set career goals to stay on track.',
    // Goals are set in GoalsModule on the career brief's #goals section (same
    // target as MemberHomeKit's goalsHref); the legacy home's learning tab
    // that used to host it is gone (WAP-195).
    href: '/dashboard/career-brief#goals',
    ctaLabel: 'Set goals',
  },
  {
    key: 'complete2Resources',
    label: 'Complete 2+ learning resources.',
    href: '/dashboard/resources',
    ctaLabel: 'Open resources',
  },
  {
    key: 'completeProfile',
    label: 'Fill in your profile details for employer visibility.',
    href: '/dashboard/profile',
    ctaLabel: 'Open profile',
  },
  {
    key: 'trackCertifications',
    label: 'Add your certificates to showcase your skills.',
    href: '/dashboard/certifications',
    ctaLabel: 'Add certificates',
  },
  {
    key: 'startPathway',
    label: 'Start a learning path to earn readiness points.',
    href: '/dashboard/learning',
    ctaLabel: 'Open Learning Hub',
  },
  {
    key: 'weeklyConsistency',
    label: 'Check in this week so your engagement score stays current.',
    href: '/dashboard',
    ctaLabel: 'View dashboard',
  },
];

const AREA_COLORS = [
  'var(--wa-info)',
  'var(--wa-accent)',
  'var(--wa-success)',
  'var(--wa-gold)',
] as const;

function pct(earned: number, max: number): number {
  return max > 0 ? Math.round((earned / max) * 100) : 0;
}

function items(
  breakdown: ScoreBreakdown,
  keys: ScoreBreakdownKey[],
): ReadinessCategoryItem[] {
  return keys.map((key) => ({
    key,
    label: SCORE_ITEM_LABELS[key],
    earned: breakdown[key].earned,
    max: breakdown[key].max,
    done: breakdown[key].done,
  }));
}

function sumItems(list: ReadinessCategoryItem[]): { earned: number; max: number } {
  return list.reduce(
    (acc, item) => ({ earned: acc.earned + item.earned, max: acc.max + item.max }),
    { earned: 0, max: 0 },
  );
}

export function buildReadinessCategories(breakdown: ScoreBreakdown): ReadinessCategory[] {
  const resumeItems = items(breakdown, ['buildResume', 'completeProfile']);
  const trainingItems = items(breakdown, [
    'trackCertifications',
    'complete2Resources',
    'completePathwaySteps',
    'startPathway',
  ]);
  const interviewItems = items(breakdown, ['practiceInterview', 'addApplications']);
  const engagementItems = items(breakdown, ['setGoals', 'weeklyConsistency']);

  const groups: { key: ReadinessCategoryKey; label: string; items: ReadinessCategoryItem[] }[] = [
    { key: 'resume', label: 'Resume & Profile', items: resumeItems },
    { key: 'training', label: 'Training & Certs', items: trainingItems },
    { key: 'interview', label: 'Interview & Jobs', items: interviewItems },
    { key: 'engagement', label: 'Engagement', items: engagementItems },
  ];

  return groups.map((group) => {
    const totals = sumItems(group.items);
    return {
      key: group.key,
      label: group.label,
      pct: pct(totals.earned, totals.max),
      earned: totals.earned,
      max: totals.max,
      items: group.items,
    };
  });
}

export function getPriorityAction(breakdown: ScoreBreakdown): ReadinessPriorityAction | null {
  for (const action of PRIORITY_ACTIONS) {
    if (!breakdown[action.key].done) {
      return {
        key: action.key,
        label: action.label,
        href: action.href,
        ctaLabel: action.ctaLabel,
      };
    }
  }
  return null;
}

export function buildReadinessMilestones(categories: ReadinessCategory[]): ReadinessMilestone[] {
  const firstIncomplete = categories.findIndex((cat) => cat.pct < 100);
  return categories.map((cat, i) => {
    if (cat.pct >= 100) {
      return { label: cat.label, when: 'Complete', state: 'done' };
    }
    if (i === firstIncomplete) {
      return { label: cat.label, when: 'In progress', state: 'active' };
    }
    return { label: cat.label, when: 'Goal', state: 'goal' };
  });
}

export function overallReadinessScore(breakdown: ScoreBreakdown): {
  earned: number;
  max: number;
  displayed: number;
} {
  const values = Object.values(breakdown);
  const earned = values.reduce((sum, item) => sum + item.earned, 0);
  const max = values.reduce((sum, item) => sum + item.max, 0);
  return {
    earned,
    max,
    displayed: Math.min(100, earned),
  };
}

export function buildReadinessProgressView(breakdown: ScoreBreakdown): ReadinessProgressView {
  const overall = overallReadinessScore(breakdown);
  const categories = buildReadinessCategories(breakdown);
  const priorityAction = getPriorityAction(breakdown);
  const weekStats = categories.map((cat, i) => ({
    value: `${cat.pct}%`,
    label: cat.label,
    color: AREA_COLORS[i] ?? 'var(--wa-accent)',
  }));

  return {
    overallScore: overall.displayed,
    overallEarned: overall.earned,
    overallMax: overall.max,
    categories,
    weekStats,
    milestones: buildReadinessMilestones(categories),
    priorityAction,
    readinessNote: priorityAction
      ? `Next: ${priorityAction.label}`
      : 'Every category is complete.',
  };
}
