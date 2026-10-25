import type { ReactNode } from 'react';
import { ArrowRight, Flame, Mic } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  DesignSurface,
  KitEmptyState,
  KpiStrip,
  PageOpener,
  ProgressRing,
  colorVar,
  cx,
  toneClass,
  tonePaint,
  type KpiItem,
} from '@/components/portal/kit';
import { MemberTrainingNav, type MemberTrainingNavHrefs } from '@/components/portal/MemberCareerSteps';
import type { ReadinessPriorityAction } from '@/lib/readiness/progressView';
import type { PointsLedgerEntry } from './MemberHomeKit';
import { MemberContextNote } from './MemberDisclosure';
import { MemberPathSegments, type PathSegment } from './MemberPathSegments';
import styles from './memberPages.module.css';

/**
 * Member Portal — progress / readiness (kit ProgressRing + area percents +
 * milestones + optional progress summary). Live at `/dashboard/readiness`;
 * proof at `/dev/member/progress`. Surface: warm (member-facing).
 *
 * Numbers are passed in from `buildReadinessProgressView` (weighted score
 * breakdown). This kit does not invent scores. A load failure is an explicit
 * empty/error, not a 0% ring. The summary slot is kit-token UI composed by
 * the page — do not mount Astryx inside this file.
 *
 * This is also the numbers page. The member Home no longer carries the four
 * stat tiles, the streak or the recent-points ledger; they live here as a
 * compact strip and a Points card. Every one of those blocks is optional and
 * renders only when the route passes its data (nothing is invented, and a
 * block with no source is left out). The live readiness route passes no points
 * data, so without it the kit shows a "Points and streak" link card to the
 * signed-in points page (`/dashboard/points`, which already builds the ledger
 * and the streak) instead of nothing: what a member could see on Home stays
 * one tap away. The pipeline rows Home dropped are not repeated here: the Job
 * board already lists the member's applications.
 */

interface WeekStat {
  value: string;
  label: string;
  /** Retained for caller compatibility; category totals render as neutral text. */
  color: string;
}

type MilestoneState = 'done' | 'active' | 'goal';

interface Milestone {
  label: string;
  when: string;
  state: MilestoneState;
}

export interface MemberProgressKitProps {
  /** Job-readiness score 0–100 (capped weighted point total). */
  readinessScore?: number;
  readinessNote?: string;
  weekStats?: WeekStat[];
  statsHeading?: string;
  milestones?: Milestone[];
  readinessCoachHref?: string;
  /** Optional route overrides for credential-free fixture owners. */
  trainingNavHrefs?: MemberTrainingNavHrefs;
  /** Optional Learning Hub route for fixture-owned next actions. */
  learningHref?: string;
  nextAction?: ReadinessPriorityAction | null;
  /** Honest error when the score breakdown failed to load. */
  loadFailed?: boolean;
  /** Kit-token recap (factual, then optional AI rewrite of the same facts). */
  summary?: ReactNode;
  /** Course completion, 0 to 100. Adds the Course tile to the numbers strip. */
  coursePercent?: number;
  /** Active applications (the count Home called "Active jobs"). Adds that tile. */
  activeJobs?: number;
  /** Certificates earned. Adds that tile. */
  certs?: number;
  /** Points total. Adds the Points tile and the Points card. */
  points?: number;
  /** Points earned this week; shown under the total. Omit to hide. */
  pointsThisWeek?: number;
  /** Recent point-earning events (same shape Home used). Omit or empty to hide the list. */
  pointsLedger?: PointsLedgerEntry[];
  /** Daily-habit streak. 0 or omitted hides the streak line. */
  currentStreak?: number;
  longestStreak?: number;
  /**
   * Where "Points and levels" goes, and, when no `points` are passed, the
   * "Points and streak" link card. `null` hides both (dev fixtures). Default:
   * the points page.
   */
  pointsHref?: string | null;
}

const DEFAULT_WEEK_STATS: WeekStat[] = [];

const DEFAULT_MILESTONES: Milestone[] = [];

const DEFAULT_LEDGER: PointsLedgerEntry[] = [];

export function MemberProgressKit({
  readinessScore = 0,
  readinessNote = 'Your score fills in from profile, resume, training, and job activity.',
  weekStats = DEFAULT_WEEK_STATS,
  statsHeading = 'Progress by area',
  milestones = DEFAULT_MILESTONES,
  readinessCoachHref = '/dashboard/ai-tools/studio?tab=session&agent=readiness',
  trainingNavHrefs,
  learningHref,
  nextAction = null,
  loadFailed = false,
  summary,
  coursePercent,
  activeJobs,
  certs,
  points,
  pointsThisWeek,
  pointsLedger = DEFAULT_LEDGER,
  currentStreak = 0,
  longestStreak = 0,
  pointsHref = '/dashboard/points',
}: MemberProgressKitProps) {
  const score = Math.max(0, Math.min(100, Math.round(readinessScore)));
  const action = nextAction?.href === '/dashboard/learning' && learningHref ? { ...nextAction, href: learningHref } : nextAction;
  // `empty.*` (KIT_GUIDE §6). buildReadinessProgressView always emits the four
  // categories, so the lists are empty only when the score read failed (the
  // `loadFailed` branch, `unavailable`/danger) or in previews — the `first`
  // states below carry no CTA because nothing the member does creates a row.
  const te = useTranslations('empty');
  const tw = useTranslations('memberWorkspace.training');
  const tp = useTranslations('progress');

  const segments: PathSegment[] = milestones.map((m, index) => ({
    key: `${index}-${m.label}`,
    name: m.label,
    state: m.state === 'done' ? 'done' : m.state === 'active' ? 'current' : 'todo',
    detail: m.when,
  }));
  // One contextual sentence from the data the route already passes.
  const numbers: KpiItem[] = [
    ...(typeof coursePercent === 'number'
      ? [{ label: tp('course'), value: `${Math.max(0, Math.min(100, Math.round(coursePercent)))}%`, tone: coursePercent >= 100 ? ('ok' as const) : undefined }]
      : []),
    ...(typeof activeJobs === 'number' ? [{ label: tp('applications'), value: activeJobs }] : []),
    ...(typeof certs === 'number' ? [{ label: tp('certificates'), value: certs }] : []),
    ...(typeof points === 'number'
      ? [{ label: tp('points'), value: points.toLocaleString('en-US'), ...(typeof pointsThisWeek === 'number' && pointsThisWeek > 0 ? { delta: tp('pointsThisWeek', { count: pointsThisWeek }) } : {}) }]
      : []),
  ];
  const hasPointsCard = typeof points === 'number';
  const openerMeta = loadFailed ? 'Score, this week, next milestone.' : nextAction ? `Next step: ${nextAction.label.replace(/[.\s]+$/, '')}.` : readinessNote;

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title={tp('title')}
          meta={openerMeta}
          aside={loadFailed ? undefined : <span className="wa-kit-chip wa-kit-chip--blue">{tp('readinessChip', { score })}</span>}
        />
         <MemberTrainingNav current="readiness" hrefs={trainingNavHrefs} />
        <MemberContextNote line={tw('learningContextShort')} moreLabel={tw('learningContextMoreLabel')} more={tw('learningContextMore')} />
        {numbers.length > 0 ? <KpiStrip items={numbers} aria-label={tp('numbersLabel')} data-testid="progress-numbers" /> : null}
        {loadFailed ? (
          <div className="wa-kit-card" data-portal-error-state="member-readiness-load">
            <KitEmptyState
              kind="unavailable"
              tone="danger"
              title={te('readinessUnavailable.title')}
              description={te('readinessUnavailable.body')}
              primaryAction={{ href: readinessCoachHref, label: te('readinessUnavailable.action') }}
            />
          </div>
        ) : (
        <div className={styles.splitGrid}>
          {/* Job readiness ring */}
          <section className={`wa-kit-card ${styles.scoreCard}`} aria-labelledby="readiness-score-title">
            <h2 id="readiness-score-title" className="wa-kit-card-title">Score</h2>
            <ProgressRing pct={score} size={160} tone="ok" label="Readiness score" />
             {action ? (
              <p className="wa-kit-lede" style={{ margin: 0 }}>
                Next:{' '}
                 <a href={action.href} className="wa-kit-focus hover:wa-opacity-90" style={{ color: 'var(--wa-accent-text)', fontWeight: 700 }}>
                   {action.label}
                </a>
              </p>
            ) : (
              <p className="wa-kit-lede" style={{ margin: 0 }}>{readinessNote}</p>
            )}
             {action ? (
              <a
                 href={action.href}
                className="wa-kit-cta wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
              >
                {action.ctaLabel}
              </a>
            ) : null}
            <a
              href={readinessCoachHref}
              className={
                nextAction
                  ? 'wa-kit-cta wa-kit-cta--ghost wa-kit-cta--block wa-kit-focus hover:wa-opacity-90'
                  : 'wa-kit-cta wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none'
              }
            >
              <Mic size={14} aria-hidden />
              Open readiness coach
            </a>
          </section>

          <div className="wa-kit-stack">
            <section className="wa-kit-card" aria-labelledby="readiness-areas-title">
              <div className="wa-kit-card__head">
                <h2 id="readiness-areas-title" className="wa-kit-card-title">{statsHeading}</h2>
              </div>
              {weekStats.length === 0 ? (
                <KitEmptyState kind="first" headingAs="h3" title={te('categoryScores.title')} description={te('categoryScores.body')} />
              ) : (
                <div className={styles.areaGrid}>
                  {weekStats.map((stat) => (
                    <div key={stat.label} className={styles.areaCell}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--wa-text)', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</div>
                      <div className="wa-kit-meta" style={{ fontWeight: 600, marginTop: 4 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="wa-kit-card" aria-labelledby="readiness-milestones-title">
              <div className="wa-kit-card__head">
                <h2 id="readiness-milestones-title" className="wa-kit-card-title">Milestones</h2>
              </div>
              {milestones.length === 0 ? (
                <KitEmptyState kind="first" headingAs="h3" title={te('milestones.title')} description={te('milestones.body')} />
              ) : (
                <MemberPathSegments segments={segments} label="Readiness milestones" />
              )}
            </section>
          </div>
        </div>
        )}
        {hasPointsCard ? (
          <section className={cx('wa-kit-card', styles.pointsCard)} aria-labelledby="progress-points-title" data-testid="progress-points">
            <div className="wa-kit-card__head">
              <h2 id="progress-points-title" className="wa-kit-card-title">{tp('pointsTitle')}</h2>
              {pointsHref ? (
                <Link href={pointsHref} className="wa-kit-card-link wa-kit-focus">
                  {tp('pointsLink')} <ArrowRight size={14} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <div className={styles.pointsBody}>
              <div className={cx('wa-kit-stat-pair', styles.statPair)}>
                <div className="wa-kit-stat-pair__cell">
                  <span className="wa-kit-stat-pair__value">{(points ?? 0).toLocaleString('en-US')}</span>
                  <span className="wa-kit-stat-pair__label">{tp('pointsUnit')}</span>
                  {typeof pointsThisWeek === 'number' ? <span className="wa-kit-stat-pair__label">{tp('pointsThisWeek', { count: pointsThisWeek })}</span> : null}
                </div>
                {currentStreak > 0 ? (
                  <div className="wa-kit-stat-pair__cell">
                    <span className={cx('wa-kit-stat-pair__value', styles.streakValue)}><Flame size={20} aria-hidden="true" />{currentStreak}</span>
                    <span className="wa-kit-stat-pair__label">{tp('streak')}</span>
                    {longestStreak > currentStreak ? <span className="wa-kit-stat-pair__label">{tp('streakBest', { count: longestStreak })}</span> : null}
                  </div>
                ) : null}
              </div>
              {pointsLedger.length > 0 ? (
                <div>
                  <h3 className={styles.sectionLabel}>{tp('recentPoints')}</h3>
                  <ul className={styles.ledger}>
                    {pointsLedger.map((entry, i) => (
                      <li key={`${entry.label}-${i}`} className={cx(styles.ledgerRow, toneClass(entry.tone))}>
                        <span className={styles.ledgerLabel}>
                          <span aria-hidden="true" className={styles.ledgerDot} style={{ background: tonePaint(entry.tone, entry.color) ?? colorVar('accent') }} />
                          {entry.label}
                        </span>
                        <span className={styles.ledgerAmount}>+{entry.amount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : pointsHref ? (
          <section className="wa-kit-card" aria-labelledby="progress-points-link-title" data-testid="progress-points-link">
            <div className="wa-kit-card__head">
              <h2 id="progress-points-link-title" className="wa-kit-card-title">{tp('pointsStreakTitle')}</h2>
              <Link href={pointsHref} className="wa-kit-card-link wa-kit-focus">
                {tp('pointsStreakLink')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className="wa-kit-lede" style={{ margin: 0 }}>{tp('pointsStreakBody')}</p>
          </section>
        ) : null}
        {summary}
      </div>
    </DesignSurface>
  );
}
