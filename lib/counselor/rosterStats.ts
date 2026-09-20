/**
 * The four stat tiles above the counselor roster (/counselor/students).
 *
 * Counselor audit §6 item 4: the roster used to open with nine cards (Total,
 * Active, At risk, Avg progress, Completions 30d, Placements 30d, Active
 * members, Enrolled, Hot member queue) that repeated each other and pushed the
 * roster a full screen down on mobile. These four are the ones a counselor
 * acts on, and each carries a one-line "why" drawn from the attention model
 * (`lib/attention`) so the number and its rule never drift apart across pages.
 *
 * Pure: takes an evaluated `AttentionQueue` plus two event counts, returns
 * view data. No Prisma, no React.
 */

import {
  ATTENTION_REASON_META,
  ATTENTION_THRESHOLDS as T,
  type AttentionQueue,
} from '@/lib/attention';

export const ROSTER_STAT_LOOKBACK_DAYS = 30;

export type CounselorRosterStatKey = 'atRisk' | 'replyOwed' | 'completions' | 'placements';

export type CounselorRosterStat = {
  key: CounselorRosterStatKey;
  label: string;
  value: number;
  /** One line under the number saying what the number counts (and, where it applies, why it matters now). */
  caption: string;
  /** Only a state paints the number (WAP-99): `accent` for act-today, `gold` for watch, undefined for neutral. */
  tone?: 'accent' | 'gold' | 'info';
  href: string;
};

type CounselorRosterStatsInput = {
  queue: AttentionQueue;
  /** `course_completed` member events in the last 30 days across the roster. */
  recentCompletions: number;
  /** `placement_recorded` member events in the last 30 days across the roster. */
  recentPlacements: number;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

export function buildCounselorRosterStats({
  queue,
  recentCompletions,
  recentPlacements,
}: CounselorRosterStatsInput): CounselorRosterStat[] {
  const { byReason } = queue.totals;

  const atRisk = byReason.risk_alert;
  const replyBreach = byReason.sla_breach_48h;
  const replyWarning = byReason.sla_warning_24h;
  const replyOwed = replyBreach + replyWarning;
  const toCongratulate = byReason.milestone_reached;

  return [
    {
      key: 'atRisk',
      label: 'At risk',
      value: atRisk,
      caption: ATTENTION_REASON_META.risk_alert.definition,
      tone: atRisk > 0 ? 'accent' : undefined,
      href: '/counselor/at-risk',
    },
    {
      key: 'replyOwed',
      label: 'Reply owed',
      value: replyOwed,
      caption:
        replyBreach > 0
          ? `${replyBreach} waiting ${T.REPLY_BREACH_HOURS}h+ · member message without a staff reply for ${T.REPLY_WARNING_HOURS}+ hours`
          : `Member message without a staff reply for ${T.REPLY_WARNING_HOURS}+ hours`,
      tone: replyBreach > 0 ? 'accent' : replyOwed > 0 ? 'gold' : undefined,
      href: '/counselor/queue',
    },
    {
      key: 'completions',
      label: `Completions, ${ROSTER_STAT_LOOKBACK_DAYS}d`,
      value: recentCompletions,
      caption:
        toCongratulate > 0
          ? `${toCongratulate} ${plural(toCongratulate, 'member')} to congratulate · ${ATTENTION_REASON_META.milestone_reached.definition}`
          : `Courses completed by your members in the last ${ROSTER_STAT_LOOKBACK_DAYS} days`,
      tone: toCongratulate > 0 ? 'info' : undefined,
      href: '/counselor/triage',
    },
    {
      key: 'placements',
      label: `Placements, ${ROSTER_STAT_LOOKBACK_DAYS}d`,
      value: recentPlacements,
      caption: `Placements recorded for your members in the last ${ROSTER_STAT_LOOKBACK_DAYS} days`,
      href: '/counselor/placements',
    },
  ];
}
