'use client';

import { PORTAL_TIMEZONE } from '@/lib/formatDate';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, CheckCircle2, RotateCcw, Flame } from 'lucide-react';
import SkillMissionChallenge from './SkillMissionChallenge';

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
  streak: number;
  careerReadinessPct: number;
  demonstratedSkills: string[];
  missions: SkillMissionSummaryItem[];
};

type MissionEvalResponse =
  | {
      ok: true;
      verdict: 'passed' | 'needs_retry';
      coachingNote: string;
      starStory: string;
      resumeBullet: string;
      skillsUnlocked: string[];
      aiToolResultId: string | null;
    }
  | { ok: false; error: string };

const kitCtaClass =
  'wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

function formatPassedDate(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  return `Passed ${d.toLocaleDateString('en-US', { timeZone: PORTAL_TIMEZONE, month: 'short', day: 'numeric' })}`;
}

function Chip({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'success' | 'gold';
}) {
  const palette = {
    muted: { bg: 'var(--wa-surface-2)', fg: 'var(--wa-muted)', border: '1px solid var(--wa-border)' },
    accent: { bg: 'var(--wa-accent-soft)', fg: 'var(--wa-accent)', border: '1px solid color-mix(in srgb, var(--wa-accent) 22%, transparent)' },
    success: { bg: 'var(--wa-success-soft)', fg: 'var(--wa-success)', border: '1px solid color-mix(in srgb, var(--wa-success) 28%, transparent)' },
    gold: { bg: 'var(--wa-gold-soft)', fg: 'var(--wa-gold)', border: '1px solid color-mix(in srgb, var(--wa-gold) 28%, transparent)' },
  }[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 999,
        background: palette.bg,
        border: palette.border,
        fontSize: 'var(--wa-type-meta)',
        fontWeight: 700,
        color: palette.fg,
      }}
    >
      {children}
    </span>
  );
}

function LockedCard({ mission }: { mission: SkillMissionSummaryItem }) {
  return (
    <article className="wa-kit-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, opacity: 0.72 }}>
      <Lock size={20} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--wa-muted)', marginTop: 2 }} />
      <div>
        <h4 style={{ margin: '0 0 4px', fontSize: 'var(--wa-type-body)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
          {mission.missionName}
        </h4>
        <p style={{ margin: 0, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.45 }}>
          Finish <strong style={{ color: 'var(--wa-text)' }}>{mission.courseTitle}</strong> to unlock
        </p>
      </div>
    </article>
  );
}

function ReadyCard({
  mission,
  onStart,
}: {
  mission: SkillMissionSummaryItem;
  onStart: () => void;
}) {
  return (
    <article
      className="wa-kit-card"
      style={{
        border: '2px solid var(--wa-accent)',
        background: 'color-mix(in srgb, var(--wa-accent-soft) 70%, var(--wa-surface))',
      }}
    >
      <div className="wa-flex wa-items-start wa-justify-between wa-flex-wrap" style={{ gap: 12, marginBottom: 8 }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--wa-accent)',
              marginBottom: 4,
            }}
          >
            Mission ready
          </span>
          <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
            {mission.missionName}
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', lineHeight: 1.45 }}>
            {mission.missionTagline}
          </p>
        </div>
        <Chip>~{mission.estimatedMinutes} min</Chip>
      </div>

      {mission.skillLabels.length > 0 ? (
        <div className="wa-flex wa-flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
          {mission.skillLabels.slice(0, 4).map((s) => (
            <Chip key={s}>{s}</Chip>
          ))}
        </div>
      ) : null}

      <button type="button" className={kitCtaClass} onClick={onStart}>
        Start mission
      </button>
    </article>
  );
}

function PassedCard({
  mission,
  resumeStudioHref,
}: {
  mission: SkillMissionSummaryItem;
  resumeStudioHref: string;
}) {
  const result = mission.latestResult;
  return (
    <article
      className="wa-kit-card"
      style={{
        border: '1px solid color-mix(in srgb, var(--wa-success) 28%, var(--wa-border))',
        background: 'color-mix(in srgb, var(--wa-success-soft) 80%, var(--wa-surface))',
      }}
    >
      <div className="wa-flex wa-items-start" style={{ gap: 10, marginBottom: 8 }}>
        <CheckCircle2 size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--wa-success)', marginTop: 2 }} />
        <div>
          <h4 style={{ margin: 0, fontSize: 'var(--wa-type-body)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
            {mission.missionName}
          </h4>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-success)' }}>
            {formatPassedDate(mission.completedAt)}
          </p>
        </div>
      </div>

      {result && result.skillsUnlocked.length > 0 ? (
        <div className="wa-flex wa-flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          {result.skillsUnlocked.map((s) => (
            <Chip key={s} tone="success">
              {s}
            </Chip>
          ))}
        </div>
      ) : null}

      {result?.resumeBullet ? (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--wa-type-meta)', fontStyle: 'italic', color: 'var(--wa-muted)', lineHeight: 1.5 }}>
          &ldquo;{result.resumeBullet}&rdquo;
        </p>
      ) : null}

      {mission.aiToolResultId ? (
        <a
          href={resumeStudioHref}
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
        >
          Open resume studio
        </a>
      ) : null}
    </article>
  );
}

function RetryCard({
  mission,
  onRetry,
}: {
  mission: SkillMissionSummaryItem;
  onRetry: () => void;
}) {
  const result = mission.latestResult;
  const preview = result?.coachingNote
    ? result.coachingNote.slice(0, 100) + (result.coachingNote.length > 100 ? '…' : '')
    : null;

  return (
    <article
      className="wa-kit-card"
      style={{
        border: '2px solid color-mix(in srgb, var(--wa-gold) 45%, var(--wa-border))',
        background: 'color-mix(in srgb, var(--wa-gold-soft) 80%, var(--wa-surface))',
      }}
    >
      <div className="wa-flex wa-items-start wa-justify-between wa-flex-wrap" style={{ gap: 12, marginBottom: 8 }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--wa-gold)',
              marginBottom: 4,
            }}
          >
            Review needed
          </span>
          <h4 style={{ margin: 0, fontSize: 'var(--wa-type-body)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
            {mission.missionName}
          </h4>
        </div>
        <RotateCcw size={18} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--wa-gold)' }} />
      </div>

      {preview ? (
        <p style={{ margin: '0 0 12px', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.5 }}>{preview}</p>
      ) : null}

      <button
        type="button"
        className={kitCtaClass}
        onClick={onRetry}
        style={{ background: 'var(--wa-gold)' }}
      >
        Retry mission
      </button>
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
  /** Proofs: Start/Retry stay on the list (no challenge POST). */
  preview?: boolean;
  resumeStudioHref?: string;
}) {
  const router = useRouter();
  const [activeMission, setActiveMission] = useState<SkillMissionSummaryItem | null>(null);

  if (!summary || summary.totalMissions === 0) return null;

  function handleComplete(_result: MissionEvalResponse & { ok: true }) {
    setActiveMission(null);
    router.refresh();
  }

  const openMission = (mission: SkillMissionSummaryItem) => {
    if (preview) return;
    setActiveMission(mission);
  };

  return (
    <>
      <section>
        {hideTitle ? null : (
          <div style={{ marginBottom: 16 }}>
            <p
              style={{
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--wa-accent)',
                margin: '0 0 4px',
              }}
            >
              Missions
            </p>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
              Skill missions
            </h3>
            <p style={{ margin: 0, fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)', lineHeight: 1.5 }}>
              One pass per course. Resume bullet and STAR story.
            </p>
          </div>
        )}

        <div className="wa-flex wa-items-center wa-flex-wrap" style={{ gap: 10, marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 'var(--wa-radius-sm)',
              background: 'var(--wa-accent-soft)',
              border: '1px solid color-mix(in srgb, var(--wa-accent) 22%, transparent)',
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--wa-accent)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {summary.careerReadinessPct}%
            </span>
            <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}>passed</span>
          </div>
          <Chip tone="success">{summary.passedCount} passed</Chip>
          {summary.readyCount > 0 ? <Chip tone="accent">{summary.readyCount} ready</Chip> : null}
          {summary.retryCount > 0 ? <Chip tone="gold">{summary.retryCount} to retry</Chip> : null}
          {summary.streak > 0 ? (
            <Chip tone="gold">
              <Flame size={13} aria-hidden="true" /> {summary.streak} streak
            </Chip>
          ) : null}
        </div>

        {summary.demonstratedSkills.length > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-muted)' }}>
              Demonstrated skills
            </p>
            <div className="wa-flex wa-flex-wrap" style={{ gap: 6 }}>
              {summary.demonstratedSkills.slice(0, 10).map((skill) => (
                <Chip key={skill} tone="success">
                  {skill}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {summary.missions.map((mission) => {
            if (mission.status === 'locked') {
              return <LockedCard key={mission.key} mission={mission} />;
            }
            if (mission.status === 'ready') {
              return <ReadyCard key={mission.key} mission={mission} onStart={() => openMission(mission)} />;
            }
            if (mission.status === 'passed') {
              return <PassedCard key={mission.key} mission={mission} resumeStudioHref={resumeStudioHref} />;
            }
            if (mission.status === 'needs_retry') {
              return <RetryCard key={mission.key} mission={mission} onRetry={() => openMission(mission)} />;
            }
            return null;
          })}
        </div>
      </section>

      {activeMission ? (
        <SkillMissionChallenge
          mission={activeMission}
          onClose={() => {
            setActiveMission(null);
            router.refresh();
          }}
          onComplete={handleComplete}
        />
      ) : null}
    </>
  );
}
