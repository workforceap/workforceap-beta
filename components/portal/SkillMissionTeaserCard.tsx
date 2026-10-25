import Link from 'next/link';
import { Target, Flame, ArrowRight } from 'lucide-react';
import { ProgressBar } from '@/components/portal/kit';

/* Dashboard-home teaser for Skill Missions. Server-renderable (no client
   state) — every state links to /dashboard/missions so the feature is always
   one tap away, even before the member has unlocked anything. */

export type SkillMissionTeaserData = {
  careerReadinessPct: number;
  passedCount: number;
  totalMissions: number;
  readyCount: number;
  retryCount: number;
  streak: number;
  nextMissionName: string | null;
  nextMissionCourse: string | null;
};

export default function SkillMissionTeaserCard({
  data,
  href = '/dashboard/missions',
}: {
  data: SkillMissionTeaserData | null;
  href?: string;
}) {
  const hasProgress = !!data && data.passedCount > 0;
  const hasReady = !!data && data.readyCount > 0;
  const hasRetry = !!data && data.retryCount > 0;

  let ctaLabel = 'Open skill missions';
  let statusLine = 'Pass a mission after each course for a resume bullet.';
  if (hasReady && data?.nextMissionName) {
    ctaLabel = 'Start challenge';
    statusLine = data.nextMissionCourse
      ? `Ready for ${data.nextMissionCourse}.`
      : 'A mission is ready.';
  } else if (hasRetry) {
    ctaLabel = 'Retry mission';
    statusLine = 'Review the last attempt, then retry.';
  } else if (hasProgress) {
    ctaLabel = 'Open career proof';
    statusLine = 'Finish the next course to unlock another mission.';
  } else if (data) {
    statusLine = 'Finish a course to unlock the first mission.';
  }

  return (
    <section
      aria-label="Skill missions"
      className="wa-kit-card"
      style={{
        padding: 'var(--wa-pad-sm)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.5rem',
        }}
      >
        <p
          style={{
            margin: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: 'var(--wa-type-meta)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--wa-accent-text)',
          }}
        >
          <Target size={13} aria-hidden="true" /> Skill missions
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {data && data.streak > 1 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 700,
                color: 'var(--wa-gold-dark)',
                background: 'var(--wa-gold-soft)',
                padding: '0.12rem 0.5rem',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
              }}
            >
              <Flame size={12} aria-hidden="true" /> {data.streak} in a row
            </span>
          )}
          {data && (
            <span
              style={{
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 700,
                color: 'var(--wa-muted-strong)',
                whiteSpace: 'nowrap',
              }}
            >
              {data.passedCount}/{data.totalMissions} passed
            </span>
          )}
        </div>
      </div>

      {hasReady && data?.nextMissionName ? (
        <h2 style={{ margin: '0 0 0.25rem', fontSize: 'var(--wa-type-body)', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--wa-text)' }}>
          {data.nextMissionName}
        </h2>
      ) : null}

      <p
        style={{
          margin: '0 0 0.75rem',
          fontSize: 'var(--wa-type-body)',
          lineHeight: 1.5,
          color: 'var(--wa-text)',
        }}
      >
        {statusLine}
      </p>

      {data && data.totalMissions > 0 && (
        <div style={{ marginBottom: '0.85rem' }}>
          <ProgressBar
            pct={Math.min(100, data.careerReadinessPct)}
            aria-label={`${data.careerReadinessPct}% of skill missions passed`}
          />
        </div>
      )}

      <Link
        href={href}
        className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
        style={{
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctaLabel}</span>
        <ArrowRight size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
      </Link>
    </section>
  );
}
