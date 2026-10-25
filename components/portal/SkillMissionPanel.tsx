'use client';

import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Lock, CheckCircle2, RotateCcw, Flame, Target } from 'lucide-react';
import { ProgressBar, cx } from '@/components/portal/kit';
import SkillMissionChallenge from './SkillMissionChallenge';
import styles from './SkillMissionPanel.module.css';

// ── Local type copies (server-only lib not importable here) ──────────────────

type MissionStatus = 'locked' | 'ready' | 'passed' | 'needs_retry';

type MissionResult = {
  verdict: 'passed' | 'needs_retry';
  coachingNote: string;
  starStory: string;
  resumeBullet: string;
  skillsUnlocked: string[];
};

/* Answers are server-only — the summary ships question text/options only. */
type QuizQuestion = {
  text: string;
  options: [string, string, string, string];
};

type SkillMissionSummaryItem = {
  key: string;
  courseSlug: string;
  programSlug: string;
  programTitle: string;
  courseTitle: string;
  missionName: string;
  missionTagline: string;
  primaryAxis: string;
  skillLabels: string[];
  scenarioPrompt: string;
  evidenceHint: string;
  quizQuestions: QuizQuestion[];
  estimatedMinutes: number;
  status: MissionStatus;
  completedAt: Date | null;
  latestResult: MissionResult | null;
  aiToolResultId: string | null;
};

export type SkillMissionSummary = {
  programSlug: string;
  programTitle: string | null;
  totalMissions: number;
  passedCount: number;
  readyCount: number;
  retryCount: number;
  /** Missions passed in a row from the first mission in the program. */
  streak: number;
  careerReadinessPct: number;
  demonstratedSkills: string[];
  missions: SkillMissionSummaryItem[];
};

const kitCtaClass = 'wa-kit-cta wa-kit-focus';

type MissionTranslate = ReturnType<typeof useTranslations>;

/** Fixed time zone and the active locale: the same text on the server and in the browser. */
function formatPassedDate(date: Date | null, locale: string, t: MissionTranslate): string {
  if (!date) return t('panel.statusPassed');
  const formatted = new Date(date).toLocaleDateString(locale, {
    timeZone: PORTAL_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  return t('panel.statusPassedOn', { date: formatted });
}

type ChipTone = 'neutral' | 'green' | 'crimson' | 'gold';

function Chip({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: ChipTone; className?: string }) {
  return <span className={cx('wa-kit-chip', `wa-kit-chip--${tone}`, className)}>{children}</span>;
}

type CardProps = {
  mission: SkillMissionSummaryItem;
  /** Heading element for the mission title. */
  Title: 'h3' | 'h4';
  titleId: string;
  setTitleRef: (el: HTMLElement | null) => void;
};

function MissionTitle({ mission, Title, titleId, setTitleRef }: CardProps) {
  return (
    <Title id={titleId} ref={setTitleRef} tabIndex={-1} className={cx('wa-kit-focus', styles.title)}>
      {mission.missionName}
    </Title>
  );
}

function LockedCard(props: CardProps) {
  const { mission } = props;
  const t = useTranslations('skillMissions');
  return (
    <article className={cx('wa-kit-card', styles.mission)} data-status="locked" aria-labelledby={props.titleId}>
      <div className={styles.missionHead}>
        <span className={styles.icon} aria-hidden="true">
          <Lock size={16} />
        </span>
        <div className={styles.missionMain}>
          <MissionTitle {...props} />
          <p className={styles.sub}>
            {t.rich('panel.lockedHint', {
              course: mission.courseTitle,
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
        <Chip className={styles.statusChip}>{t('panel.statusLocked')}</Chip>
      </div>
    </article>
  );
}

function ReadyCard({ onStart, ...props }: CardProps & { onStart: () => void }) {
  const { mission } = props;
  const t = useTranslations('skillMissions');
  return (
    <article
      className={cx('wa-kit-card', 'wa-kit-card--accent-edge', styles.mission)}
      data-status="ready"
      aria-labelledby={props.titleId}
    >
      <div className={styles.missionHead}>
        <span className={styles.icon} data-tone="accent" aria-hidden="true">
          <Target size={16} />
        </span>
        <div className={styles.missionMain}>
          <MissionTitle {...props} />
          <p className={styles.sub}>{mission.missionTagline}</p>
        </div>
        <Chip className={styles.statusChip}>{t('panel.minutes', { minutes: mission.estimatedMinutes })}</Chip>
      </div>

      {mission.skillLabels.length > 0 ? (
        <div className={styles.chipRow}>
          {mission.skillLabels.slice(0, 4).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={kitCtaClass} onClick={onStart} aria-describedby={props.titleId}>
          {t('panel.start')}
        </button>
      </div>
    </article>
  );
}

function PassedCard({
  resumeStudioHref,
  ...props
}: CardProps & { resumeStudioHref: string }) {
  const { mission } = props;
  const t = useTranslations('skillMissions');
  const locale = useLocale();
  const result = mission.latestResult;
  return (
    <article className={cx('wa-kit-card', styles.mission)} data-status="passed" aria-labelledby={props.titleId}>
      <div className={styles.missionHead}>
        <span className={styles.icon} data-tone="success" aria-hidden="true">
          <CheckCircle2 size={16} />
        </span>
        <div className={styles.missionMain}>
          <MissionTitle {...props} />
        </div>
        <Chip tone="green" className={styles.statusChip}>
          {formatPassedDate(mission.completedAt, locale, t)}
        </Chip>
      </div>

      {result && result.skillsUnlocked.length > 0 ? (
        <div className={styles.chipRow}>
          {result.skillsUnlocked.map((s) => (
            <Chip key={s} tone="green">
              {s}
            </Chip>
          ))}
        </div>
      ) : null}

      {result?.resumeBullet ? <p className={styles.quote}>&ldquo;{result.resumeBullet}&rdquo;</p> : null}

      {mission.aiToolResultId ? (
        <div className={styles.actions}>
          <Link href={resumeStudioHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
            {t('panel.openResumeStudio')}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function RetryCard({ onRetry, ...props }: CardProps & { onRetry: () => void }) {
  const { mission } = props;
  const t = useTranslations('skillMissions');
  const note = mission.latestResult?.coachingNote.trim() || null;
  return (
    <article className={cx('wa-kit-card', styles.mission)} data-status="needs_retry" aria-labelledby={props.titleId}>
      <div className={styles.missionHead}>
        <span className={styles.icon} aria-hidden="true">
          <RotateCcw size={16} />
        </span>
        <div className={styles.missionMain}>
          <MissionTitle {...props} />
        </div>
        <Chip className={styles.statusChip}>{t('panel.statusReview')}</Chip>
      </div>

      {note ? <p className={styles.coaching}>{note}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={kitCtaClass} onClick={onRetry} aria-describedby={props.titleId}>
          {t('panel.retry')}
        </button>
      </div>
    </article>
  );
}

export default function SkillMissionPanel({
  summary,
  hideTitle = false,
  preview = false,
  resumeStudioHref = '/dashboard/ai-tools/resume-studio',
}: {
  summary: SkillMissionSummary | null;
  /** When the route already has a PageOpener, skip the inner “Skill Missions” heading. */
  hideTitle?: boolean;
  /** Proofs: Start/Retry open the overlay in preview mode (canned results, no POST). */
  preview?: boolean;
  resumeStudioHref?: string;
}) {
  const router = useRouter();
  const t = useTranslations('skillMissions');
  const baseId = useId();
  const [activeMission, setActiveMission] = useState<SkillMissionSummaryItem | null>(null);
  const titleRefs = useRef(new Map<string, HTMLElement>());
  // After a mission closes its card can change state (ready -> passed), which
  // removes the button that opened it. Keep the mission key and the summary at
  // close time so focus can move to the new card once the refresh lands.
  const pendingFocus = useRef<{ key: string; summary: SkillMissionSummary | null } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || activeMission || summary === pending.summary) return;
    pendingFocus.current = null;
    const focused = document.activeElement;
    const focusLost = !focused || focused === document.body || !focused.isConnected;
    if (focusLost) titleRefs.current.get(pending.key)?.focus({ preventScroll: true });
  }, [summary, activeMission]);

  if (!summary || summary.totalMissions === 0) return null;

  const SectionHeading = hideTitle ? 'h2' : 'h3';
  const MissionHeading = hideTitle ? 'h3' : 'h4';

  const closeChallenge = () => {
    if (activeMission) pendingFocus.current = { key: activeMission.key, summary };
    setActiveMission(null);
    router.refresh();
  };

  const progressId = `${baseId}-progress`;
  const listId = `${baseId}-list`;

  return (
    <>
      <section className={styles.panel} aria-label={hideTitle ? undefined : t('title')}>
        {hideTitle ? null : (
          <div>
            <h2 className={styles.heading}>{t('title')}</h2>
            <p className={styles.lede}>{t('lede')}</p>
          </div>
        )}

        <section className={cx('wa-kit-card', styles.progress)} aria-labelledby={progressId}>
          <div className="wa-kit-card__head">
            <div>
              <SectionHeading id={progressId} className="wa-kit-card-title">
                {t('panel.progressTitle')}
              </SectionHeading>
              <p className="wa-kit-card-sub">
                {t('panel.progressSummary', { passed: summary.passedCount, total: summary.totalMissions })}
              </p>
            </div>
            <span className="wa-kit-card-count">
              {t.rich('panel.progressPercent', {
                pct: summary.careerReadinessPct,
                b: (chunks) => <b>{chunks}</b>,
              })}
            </span>
          </div>
          <ProgressBar pct={summary.careerReadinessPct} aria-label={t('panel.progressLabel')} />
          <div className={styles.chipRow}>
            <Chip tone="green">{t('panel.chipPassed', { count: summary.passedCount })}</Chip>
            {summary.readyCount > 0 ? (
              <Chip tone="crimson">{t('panel.chipReady', { count: summary.readyCount })}</Chip>
            ) : null}
            {summary.retryCount > 0 ? <Chip>{t('panel.chipRetry', { count: summary.retryCount })}</Chip> : null}
            {summary.streak > 1 ? (
              <Chip tone="gold">
                <Flame aria-hidden="true" /> {t('panel.chipStreak', { count: summary.streak })}
              </Chip>
            ) : null}
          </div>

          {summary.demonstratedSkills.length > 0 ? (
            <div className={styles.skillsBlock}>
              <p className={styles.skillsLabel}>{t('panel.skillsShown')}</p>
              <div className={styles.chipRow}>
                {summary.demonstratedSkills.slice(0, 10).map((skill) => (
                  <Chip key={skill} tone="green">
                    {skill}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.listSection} aria-labelledby={listId}>
          <SectionHeading id={listId} className="wa-kit-card-title">
            {t('panel.listHeading')}
          </SectionHeading>
          <ul className={styles.list}>
            {summary.missions.map((mission, index) => {
              const titleId = `${baseId}-m${index}`;
              const cardProps: CardProps = {
                mission,
                Title: MissionHeading,
                titleId,
                setTitleRef: (el) => {
                  if (el) titleRefs.current.set(mission.key, el);
                  else titleRefs.current.delete(mission.key);
                },
              };
              return (
                <li key={mission.key}>
                  {mission.status === 'locked' ? (
                    <LockedCard {...cardProps} />
                  ) : mission.status === 'ready' ? (
                    <ReadyCard {...cardProps} onStart={() => setActiveMission(mission)} />
                  ) : mission.status === 'passed' ? (
                    <PassedCard {...cardProps} resumeStudioHref={resumeStudioHref} />
                  ) : (
                    <RetryCard {...cardProps} onRetry={() => setActiveMission(mission)} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </section>

      {activeMission ? (
        <SkillMissionChallenge
          mission={activeMission}
          preview={preview}
          onClose={closeChallenge}
          onComplete={closeChallenge}
        />
      ) : null}
    </>
  );
}
