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
  /** Lowest-percent incomplete area — what the coach note and primary CTA follow. */
  weakestCategory: ReadinessCategoryKey | null;
  readinessNote: string;
};

/**
 * Count goals behind the partial-credit items, matching `lib/readiness/score.ts`
 * (`done` at 2 resources, 3 pathway steps, 3 applications; full points at 2 / 5 / 3). Exported so the
 * recap grounding gate can allow these small numbers in the coach note.
 */
export const READINESS_GOAL_COUNTS = { resources: 2, pathwaySteps: 3, applications: 3 } as const;

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
 * One action per scored item. `getPriorityAction` picks from the weakest
 * area first (most remaining points wins inside it); this list order only
 * breaks ties. Weights match `lib/readiness/score.ts`. Training items go to
 * /dashboard/program ("My Program"), which lists the member's modules —
 * /dashboard/training is a redirect stub to it, and /dashboard would loop
 * the member back to the page they clicked from.
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
    label: 'Complete more pathway steps in your training program.',
    href: '/dashboard/program',
    ctaLabel: 'Continue training',
  },
  {
    key: 'setGoals',
    label: 'Set career goals to stay on track.',
    href: '/dashboard/career-brief',
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
    label: 'Start a training pathway to earn readiness points.',
    href: '/dashboard/program',
    ctaLabel: 'Start training',
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

/**
 * Lowest-percent incomplete area, ties broken by display order. `null` when
 * every area is at 100%.
 */
export function weakestReadinessCategory(categories: ReadinessCategory[]): ReadinessCategory | null {
  let weakest: ReadinessCategory | null = null;
  for (const cat of categories) {
    if (cat.pct >= 100) continue;
    if (!weakest || cat.pct < weakest.pct) weakest = cat;
  }
  return weakest;
}

/**
 * The one next step the whole readiness page agrees on: the weakest area's
 * unfinished item with the most points left (ties keep PRIORITY_ACTIONS
 * order). An area whose items all read `done` but still sits under 100%
 * (pathway steps keep scoring past the 3-step goal) yields to the next
 * weakest area, so the CTA always names something the member can still do.
 */
export function getPriorityAction(breakdown: ScoreBreakdown): ReadinessPriorityAction | null {
  const ranked = [...buildReadinessCategories(breakdown)].sort((a, b) => a.pct - b.pct);
  for (const cat of ranked) {
    let best: (typeof PRIORITY_ACTIONS)[number] | null = null;
    let bestRemaining = -1;
    for (const action of PRIORITY_ACTIONS) {
      const item = breakdown[action.key];
      if (item.done || !cat.items.some((i) => i.key === action.key)) continue;
      const remaining = item.max - item.earned;
      if (remaining > bestRemaining) {
        best = action;
        bestRemaining = remaining;
      }
    }
    if (best) {
      return { key: best.key, label: best.label, href: best.href, ctaLabel: best.ctaLabel };
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
  // Weights sum to 100, so the displayed score is the points earned — no cap.
  return { earned, max, displayed: earned };
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
    weakestCategory: weakestReadinessCategory(categories)?.key ?? null,
    readinessNote: priorityAction
      ? `Next: ${priorityAction.label}`
      : 'Every category is complete.',
  };
}
