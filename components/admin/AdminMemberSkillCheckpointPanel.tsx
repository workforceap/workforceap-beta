'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Types defined locally — this is a client component and cannot import
// from lib/member/skillMissions (server-only module).
type MissionStatus = 'locked' | 'ready' | 'passed' | 'needs_retry';

type MissionResult = {
  verdict: string;
  coachingNote: string;
  starStory: string;
  resumeBullet: string;
  skillsUnlocked: string[];
};

type Mission = {
  key: string;
  courseTitle: string;
  missionName: string;
  status: MissionStatus;
  completedAt: Date | null;
  latestResult: MissionResult | null;
  aiToolResultId: string | null;
  skillLabels: string[];
};

type SkillMissionSummary = {
  programSlug: string;
  programTitle: string | null;
  totalMissions: number;
  passedCount: number;
  readyCount: number;
  retryCount: number;
  streak: number;
  careerReadinessPct: number;
  demonstratedSkills: string[];
  missions: Mission[];
};

const STATUS_BADGE: Record<MissionStatus, { label: string; bg: string; color: string }> = {
  passed: { label: 'Passed', bg: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)' },
  needs_retry: { label: 'Needs retry', bg: 'var(--wa-danger-soft)', color: 'var(--wa-danger-text)' },
  ready: { label: 'Ready', bg: 'var(--wa-info-soft)', color: 'var(--wa-info-dark)' },
  locked: { label: 'Locked', bg: 'color-mix(in srgb, var(--wa-muted) 12%, transparent)', color: 'var(--wa-muted-strong)' },
};

function StatusBadge({ status }: { status: MissionStatus }) {
  const cfg = STATUS_BADGE[status];
  return (
    <span
      style={{
        padding: '0.15rem 0.55rem',
        borderRadius: '9999px',
        fontSize: '0.8125rem',
        fontWeight: 700,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

function SkillChip({ label, variant = 'green' }: { label: string; variant?: 'green' | 'blue' }) {
  const isGreen = variant === 'green';
  return (
    <span
      style={{
        padding: '0.15rem 0.45rem',
        borderRadius: '9999px',
        fontSize: '0.8125rem',
        fontWeight: 600,
        background: isGreen ? 'var(--wa-success-soft)' : 'var(--wa-info-soft)',
        color: isGreen ? 'var(--wa-success-dark)' : 'var(--wa-info-dark)',
      }}
    >
      {label}
    </span>
  );
}

function StarStoryToggle({ starStory }: { starStory: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: '0.8125rem',
          color: 'var(--color-accent)',
          fontWeight: 600,
        }}
      >
        {open ? 'Hide STAR story ▲' : 'Show STAR story ▼'}
      </button>
      {open && (
        <p
          style={{
            marginTop: '0.35rem',
            fontSize: '0.85rem',
            lineHeight: 1.55,
            color: 'var(--color-on-surface-variant)',
            borderLeft: '3px solid var(--outline-variant)',
            paddingLeft: '0.75rem',
            whiteSpace: 'pre-wrap',
          }}
        >
          {starStory}
        </p>
      )}
    </div>
  );
}

function OverrideDropdown({
  missionKey,
  programSlug,
  memberId,
  onDone,
}: {
  missionKey: string;
  programSlug: string | null;
  memberId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(decision: 'passed' | 'needs_retry') {
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(memberId)}/skill-checkpoints`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkpointKey: missionKey,
            decision,
            programSlug: programSlug ?? '',
            notes: '',
          }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(payload.error ?? 'Override failed.');
        return;
      }
      setOpen(false);
      onDone();
    } catch {
      setErr('Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  const dropdownId = `override-dropdown-${missionKey}`;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={dropdownId}
        style={{ fontSize: '0.8125rem', padding: '0.25rem 0.65rem' }}
        onClick={() => setOpen((v) => !v)}
      >
        Override
      </button>
      {open && (
        <div
          id={dropdownId}
          style={{
            position: 'absolute',
            right: 0,
            top: '110%',
            zIndex: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--outline-variant)',
            borderRadius: '0.5rem',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            minWidth: '140px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>
            Admin override
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: '0.8125rem', padding: '0.3rem 0.65rem' }}
            disabled={pending}
            onClick={() => submit('passed')}
          >
            Force pass
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ fontSize: '0.8125rem', padding: '0.3rem 0.65rem' }}
            disabled={pending}
            onClick={() => submit('needs_retry')}
          >
            Force retry
          </button>
          {err && (
            <p role="alert" style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-danger-text)' }}>
              {err}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MissionCard({
  mission,
  memberId,
  programSlug,
  onRefresh,
}: {
  mission: Mission;
  memberId: string;
  programSlug: string | null;
  onRefresh: () => void;
}) {
  const isLocked = mission.status === 'locked';
  const isPassed = mission.status === 'passed';
  const isRetry = mission.status === 'needs_retry';
  const isReady = mission.status === 'ready';

  return (
    <article
      style={{
        borderRadius: '0.75rem',
        border: '1px solid var(--outline-variant)',
        background: isLocked ? 'var(--surface-container-highest)' : 'var(--color-surface)',
        padding: '0.95rem',
        opacity: isLocked ? 0.55 : 1,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: '0 0 0.2rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--color-on-surface-variant)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {mission.courseTitle}
          </p>
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>{mission.missionName}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <StatusBadge status={mission.status} />
          {(isPassed || isRetry) && (
            <OverrideDropdown
              missionKey={mission.key}
              programSlug={programSlug}
              memberId={memberId}
              onDone={onRefresh}
            />
          )}
        </div>
      </div>

      {/* Passed: resume bullet + STAR story toggle */}
      {isPassed && mission.latestResult && (
        <div style={{ marginTop: '0.65rem' }}>
          {mission.latestResult.resumeBullet && (
            <p
              style={{
                margin: '0 0 0.35rem',
                fontSize: '0.88rem',
                fontStyle: 'italic',
                lineHeight: 1.5,
                color: 'var(--color-on-surface)',
              }}
            >
              {mission.latestResult.resumeBullet}
            </p>
          )}
          {mission.latestResult.starStory && (
            <StarStoryToggle starStory={mission.latestResult.starStory} />
          )}
          {mission.completedAt && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
              Passed{' '}
              {new Date(mission.completedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
      )}

      {/* Needs retry: coaching note + skills unlocked */}
      {isRetry && mission.latestResult && (
        <div style={{ marginTop: '0.65rem' }}>
          {mission.latestResult.coachingNote && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--wa-danger) 6%, transparent)',
                borderLeft: '3px solid color-mix(in srgb, var(--wa-danger) 40%, transparent)',
                borderRadius: '0 0.4rem 0.4rem 0',
                padding: '0.55rem 0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <p style={{ margin: '0 0 0.2rem', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-danger-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI coaching note
              </p>
              <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.5, color: 'var(--color-on-surface)' }}>
                {mission.latestResult.coachingNote}
              </p>
            </div>
          )}
          {mission.latestResult.skillsUnlocked.length > 0 && (
            <div>
              <p style={{ margin: '0 0 0.3rem', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)' }}>
                Skills to demonstrate
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {mission.latestResult.skillsUnlocked.map((s) => (
                  <SkillChip key={s} label={s} variant="blue" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ready: awaiting submission */}
      {isReady && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.87rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
          Awaiting student submission
        </p>
      )}

      {/* Locked: greyed course name already shown in header */}

      {/* Skill labels (all states) */}
      {!isLocked && mission.skillLabels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.65rem' }}>
          {mission.skillLabels.slice(0, 6).map((s) => (
            <SkillChip key={s} label={s} variant="green" />
          ))}
        </div>
      )}
    </article>
  );
}

export default function AdminMemberSkillCheckpointPanel({
  memberId,
  summary,
}: {
  memberId: string;
  summary: SkillMissionSummary | null;
}) {
  const router = useRouter();

  if (!summary || summary.totalMissions === 0) return null;

  return (
    <section style={{ padding: '1rem', background: 'var(--color-light)', borderRadius: 'var(--radius-md)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.2rem' }}>Skill Missions</h2>
          {summary.programTitle && (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
              {summary.programTitle}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: summary.careerReadinessPct >= 80 ? 'var(--wa-success-dark)' : summary.careerReadinessPct >= 40 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)',
            }}
          >
            {summary.careerReadinessPct}% of missions passed
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.8125rem' }}>
            <span style={{ padding: '0.15rem 0.45rem', borderRadius: '9999px', background: 'var(--wa-success-soft)', color: 'var(--wa-success-dark)', fontWeight: 600 }}>
              {summary.passedCount} passed
            </span>
            {summary.readyCount > 0 && (
              <span style={{ padding: '0.15rem 0.45rem', borderRadius: '9999px', background: 'var(--wa-info-soft)', color: 'var(--wa-info-dark)', fontWeight: 600 }}>
                {summary.readyCount} ready
              </span>
            )}
            {summary.retryCount > 0 && (
              <span style={{ padding: '0.15rem 0.45rem', borderRadius: '9999px', background: 'var(--wa-danger-soft)', color: 'var(--wa-danger-text)', fontWeight: 600 }}>
                {summary.retryCount} retry
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Demonstrated skills chips */}
      {summary.demonstratedSkills.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)' }}>
            Demonstrated skills
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {summary.demonstratedSkills.slice(0, 12).map((skill) => (
              <SkillChip key={skill} label={skill} variant="green" />
            ))}
          </div>
        </div>
      )}

      {/* Mission cards */}
      <div style={{ display: 'grid', gap: '0.85rem' }}>
        {summary.missions.map((mission) => (
          <MissionCard
            key={mission.key}
            mission={mission}
            memberId={memberId}
            programSlug={summary.programSlug}
            onRefresh={() => router.refresh()}
          />
        ))}
      </div>
    </section>
  );
}
