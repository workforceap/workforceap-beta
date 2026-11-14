/**
 * Milestone badges, slice 1. Pure and client-safe: no database, no server-only.
 *
 * A badge is earned from events `awardPoints()` already records, counted by
 * distinct `entityId` (the points ledger's unique key makes a repeat a no-op).
 * The streak badge is the exception: it reads `MemberPoints.longestStreak`,
 * which no transaction date can reconstruct.
 */

export const CELEBRATION_NOTE_PREFIX = 'Course completion celebration:';

export type BadgeKey =
  | 'ready_to_start'
  | 'resume_ready'
  | 'job_hunter'
  | 'first_course'
  | 'certified'
  | 'streak_7';

export type MemberBadge = {
  key: BadgeKey;
  label: string;
  description: string;
  earned: boolean;
  /** ISO time of the Nth distinct qualifying row. Null for the streak badge. */
  earnedAt: string | null;
  have: number;
  need: number;
};

export type BadgeDefinition = {
  key: BadgeKey;
  label: string;
  description: string;
  /** Points event this badge counts. Absent only for the streak badge. */
  event?: string;
  need: number;
  /** Rows whose note starts with this prefix do not count (celebration cron). */
  excludeNotePrefix?: string;
};

export const BADGES: readonly BadgeDefinition[] = [
  {
    key: 'ready_to_start',
    label: 'Ready to start',
    description: 'Finish your training preassessment.',
    event: 'assessment_completed',
    need: 1,
  },
  {
    key: 'resume_ready',
    label: 'Resume ready',
    description: 'Upload your resume.',
    event: 'resume_uploaded',
    need: 1,
  },
  {
    key: 'job_hunter',
    label: 'Job hunter',
    description: 'Add 3 job applications.',
    event: 'job_application',
    need: 3,
  },
  {
    key: 'first_course',
    label: 'First course done',
    description: 'Complete your first course.',
    event: 'course_completed',
    need: 1,
  },
  {
    key: 'certified',
    label: 'Certified',
    description: 'Earn a certification an admin approves.',
    event: 'certification_earned',
    need: 1,
    excludeNotePrefix: CELEBRATION_NOTE_PREFIX,
  },
  {
    key: 'streak_7',
    label: '7-day streak',
    description: 'Reach a 7-day streak.',
    need: 7,
  },
];

export type BadgeTransaction = {
  event: string;
  entityId: string;
  note?: string | null;
  createdAt: Date;
};

/** Distinct qualifying rows, oldest first, so the Nth one's date is the earn date. */
function qualifyingRows(rows: BadgeTransaction[], badge: BadgeDefinition): BadgeTransaction[] {
  if (!badge.event) return [];
  const seen = new Set<string>();
  return rows
    .filter((row) => row.event === badge.event)
    .filter((row) => !badge.excludeNotePrefix || !row.note?.startsWith(badge.excludeNotePrefix))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .filter((row) => {
      if (seen.has(row.entityId)) return false;
      seen.add(row.entityId);
      return true;
    });
}

/**
 * Evaluate every badge from one member's points rows and their best streak.
 * Returns the badges in definition order.
 */
export function evaluateBadges(
  rows: BadgeTransaction[],
  streak: { longestStreak: number },
): MemberBadge[] {
  const best = Math.max(0, Math.floor(streak.longestStreak ?? 0));
  return BADGES.map((badge) => {
    if (badge.key === 'streak_7') {
      return {
        key: badge.key,
        label: badge.label,
        description: badge.description,
        earned: best >= badge.need,
        earnedAt: null,
        have: best,
        need: badge.need,
      };
    }
    const hits = qualifyingRows(rows, badge);
    const earned = hits.length >= badge.need;
    return {
      key: badge.key,
      label: badge.label,
      description: badge.description,
      earned,
      earnedAt: earned ? hits[badge.need - 1].createdAt.toISOString() : null,
      have: hits.length,
      need: badge.need,
    };
  });
}

/** The first unearned badge, in definition order. Null when all six are earned. */
export function nextUnearnedBadge(badges: MemberBadge[]): MemberBadge | null {
  return badges.find((badge) => !badge.earned) ?? null;
}
