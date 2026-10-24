import type { ReactNode } from 'react';
import { Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DesignSurface, PageOpener, ProgressRing, KitEmptyState } from '@/components/portal/kit';
import { MemberTrainingNav } from '@/components/portal/MemberCareerSteps';
import workspaceStyles from '@/components/portal/MemberWorkspace.module.css';
import type { ReadinessPriorityAction } from '@/lib/readiness/progressView';
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
  nextAction?: ReadinessPriorityAction | null;
  /** Honest error when the score breakdown failed to load. */
  loadFailed?: boolean;
  /** Kit-token recap (factual, then optional AI rewrite of the same facts). */
  summary?: ReactNode;
}

const DEFAULT_WEEK_STATS: WeekStat[] = [];

const DEFAULT_MILESTONES: Milestone[] = [];

export function MemberProgressKit({
  readinessScore = 0,
  readinessNote = 'Your score fills in from profile, resume, training, and job activity.',
  weekStats = DEFAULT_WEEK_STATS,
  statsHeading = 'Progress by area',
  milestones = DEFAULT_MILESTONES,
  readinessCoachHref = '/dashboard/ai-tools/studio?tab=session&agent=readiness',
  nextAction = null,
  loadFailed = false,
  summary,
}: MemberProgressKitProps) {
  const score = Math.max(0, Math.min(100, Math.round(readinessScore)));
  // `empty.*` (KIT_GUIDE §6). buildReadinessProgressView always emits the four
  // categories, so the lists are empty only when the score read failed (the
  // `loadFailed` branch, `unavailable`/danger) or in previews — the `first`
  // states below carry no CTA because nothing the member does creates a row.
  const te = useTranslations('empty');
  const tw = useTranslations('memberWorkspace.training');

  const segments: PathSegment[] = milestones.map((m, index) => ({
    key: `${index}-${m.label}`,
    name: m.label,
    state: m.state === 'done' ? 'done' : m.state === 'active' ? 'current' : 'todo',
    detail: m.when,
  }));
  // One contextual sentence from the data the route already passes.
  const openerMeta = loadFailed ? 'Score, this week, next milestone.' : nextAction ? `Next step: ${nextAction.label.replace(/[.\s]+$/, '')}.` : readinessNote;

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title="Readiness"
          meta={openerMeta}
          aside={loadFailed ? undefined : <span className="wa-kit-chip wa-kit-chip--blue">Score {score} of 100</span>}
        />
        <MemberTrainingNav current="readiness" />
        <p className={workspaceStyles.context}>{tw('learningContext')}</p>
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
            {nextAction ? (
              <p className="wa-kit-lede" style={{ margin: 0 }}>
                Next:{' '}
                <a href={nextAction.href} className="wa-kit-focus hover:wa-opacity-90" style={{ color: 'var(--wa-accent-text)', fontWeight: 700 }}>
                  {nextAction.label}
                </a>
              </p>
            ) : (
              <p className="wa-kit-lede" style={{ margin: 0 }}>{readinessNote}</p>
            )}
            {nextAction ? (
              <a
                href={nextAction.href}
                className="wa-kit-cta wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
              >
                {nextAction.ctaLabel}
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
        {summary}
      </div>
    </DesignSurface>
  );
}
