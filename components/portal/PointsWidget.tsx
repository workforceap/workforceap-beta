import { Suspense } from 'react';
import Link from 'next/link';
import type { LevelName } from '@/lib/member/pointsConfig';
import { getLevelForPoints, getNextLevel, LEVELS, EVENT_LABELS } from '@/lib/member/pointsConfig';

/**
 * Encouraging streak banner — shown when a member has an active daily-habit
 * streak. Tasteful, uses the design-system tokens, and degrades to nothing
 * when there is no streak (currentStreak <= 0).
 */
function StreakBanner({
  currentStreak,
  longestStreak,
}: {
  currentStreak: number;
  longestStreak: number;
}) {
  if (!currentStreak || currentStreak <= 0) return null;

  const flame = 'var(--color-orange, #f97316)';
  const isRecord = longestStreak > 0 && currentStreak >= longestStreak;
  const message = isRecord
    ? 'Your best streak yet — keep it going!'
    : 'Come back tomorrow to keep it going!';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        background: `${flame}14`,
        border: `1px solid ${flame}33`,
        borderRadius: 'var(--radius-md, 0.75rem)',
        padding: '0.625rem 0.75rem',
        marginBottom: '1rem',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden="true"
        style={{ fontSize: '1.5rem', color: flame, '--ms-fill': 1 } as React.CSSProperties}
      >
        local_fire_department
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }}>
          {currentStreak}-day streak
        </p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
          {message}
          {longestStreak > currentStreak ? ` · Best: ${longestStreak} days` : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact streak widget — always visible when the member has any streak
 * history (current > 0 or longest > 0). Rendered below the banner so the
 * gamification layer is present even when the banner is hidden (e.g. on
 * counselor/staff views where streak props are not passed).
 */
function StreakMiniCard({
  currentStreak,
  longestStreak,
}: {
  currentStreak: number;
  longestStreak: number;
}) {
  // No early return at zero: the card's whole job includes the encouraging
  // "No active streak / Start today!" state (otherwise that branch below is
  // unreachable dead code and new members never see the nudge).
  const flame = 'var(--color-orange, #f97316)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: `${flame}10`,
          border: `1px solid ${flame}25`,
          borderRadius: 'var(--radius-md, 0.75rem)',
          padding: '0.5rem 0.75rem',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: '1.25rem', color: flame, '--ms-fill': 1 } as React.CSSProperties}
        >
          local_fire_department
        </span>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '0.85rem',
              fontWeight: 800,
              color: 'var(--color-on-surface)',
            }}
          >
            {currentStreak > 0 ? `${currentStreak}-day streak` : 'No active streak'}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            {longestStreak > 0 ? `Best: ${longestStreak} days` : 'Start today!'}
          </p>
        </div>
      </div>
    </div>
  );
}

const LEVEL_ICONS: Record<LevelName, string> = {
  starter:  'sprout',
  builder:  'build',
  achiever: 'star',
  champion: 'emoji_events',
};

/**
 * Async server child that resolves the signed-in member's streak and renders
 * the banner. Used only when the parent does not pass streak props, so the
 * streak surfaces wherever the widget is already mounted without the page
 * having to thread streak data through. Lazy server imports keep this out of
 * client/jsdom bundles. Best-effort: any failure renders nothing.
 */
async function ResolvedStreakBanner({ total }: { total: number }) {
  try {
    const [{ getUser }, { getMemberPoints }] = await Promise.all([
      import('@/lib/auth/server'),
      import('@/lib/member/points'),
    ]);
    const user = await getUser();
    if (!user) return null;
    // Resolve the SIGNED-IN member's own streak + points. Only render when the
    // points shown by this widget belong to the signed-in user (their own
    // total matches). This prevents a counselor viewing a student's widget from
    // seeing the counselor's own streak surfaced under the student's points.
    const mp = await getMemberPoints(user.id);
    if (mp.total !== total) return null;
    return <StreakBanner currentStreak={mp.currentStreak} longestStreak={mp.longestStreak} />;
  } catch {
    return null;
  }
}

type RecentTransaction = {
  id: string;
  event: string;
  points: number;
  note: string | null;
  createdAt: Date;
};

export default function PointsWidget({
  total,
  level,
  recent = [],
  compact = false,
  currentStreak,
  longestStreak,
}: {
  total: number;
  level: LevelName;
  recent?: RecentTransaction[];
  compact?: boolean;
  /**
   * Daily-habit streak. Optional + additive: when omitted the widget renders
   * exactly as before. When the caller does not pass streak props, the widget
   * self-resolves the signed-in member's streak (see default export wiring
   * below) so it surfaces wherever the widget is already mounted.
   */
  currentStreak?: number;
  longestStreak?: number;
}) {
  const streak = currentStreak ?? 0;
  const bestStreak = longestStreak ?? 0;
  const levelMeta = getLevelForPoints(total);
  const nextLevel = getNextLevel(level);
  const pctToNext = nextLevel
    ? Math.min(100, Math.round(((total - levelMeta.min) / (nextLevel.min - levelMeta.min)) * 100))
    : 100;
  const icon = LEVEL_ICONS[level];

  if (compact) {
    return (
      <div
        className="portal-kpi-card"
        style={{ padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '1.5rem', color: levelMeta.color, '--ms-fill': 1 } as React.CSSProperties}
        >
          {icon}
        </span>
        <div>
          <p className="portal-kpi-card__label">Points</p>
          <p style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', margin: 0, color: levelMeta.color, fontVariantNumeric: 'tabular-nums' }}>
            {total.toLocaleString()}
          </p>
          <p className="portal-kpi-card__hint">{levelMeta.label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.75rem', color: levelMeta.color, '--ms-fill': 1 } as React.CSSProperties}
          >
            {icon}
          </span>
          <div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', marginBottom: '0.15rem' }}>
              My Points
            </p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, margin: 0, color: levelMeta.color, fontVariantNumeric: 'tabular-nums' }}>
              {total.toLocaleString()}
            </p>
          </div>
        </div>
        <span
          style={{
            background: `${levelMeta.color}18`,
            color: levelMeta.color,
            border: `1px solid ${levelMeta.color}30`,
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 700,
          }}
        >
          {levelMeta.label}
        </span>
      </div>

      {/* Daily-habit streak. When the caller passes streak props we render them
          directly (pure). When omitted, an async server child self-resolves the
          signed-in member's streak so it surfaces wherever the widget is already
          mounted — without the parent page needing to thread streak data. */}
      {currentStreak === undefined && longestStreak === undefined ? (
        <Suspense fallback={null}>
          <ResolvedStreakBanner total={total} />
        </Suspense>
      ) : (
        <StreakBanner currentStreak={streak} longestStreak={bestStreak} />
      )}

      {/* Streak mini-card — additive gamification layer. Always visible when the
          member has any streak data (current > 0 or longest > 0). */}
      <StreakMiniCard currentStreak={streak} longestStreak={bestStreak} />

      {/* Progress to next level */}
      {nextLevel && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>
            <span>{pctToNext}% to {nextLevel.label}</span>
            <span>{nextLevel.min - total} pts needed</span>
          </div>
          <div style={{ height: '6px', background: 'var(--surface-container-highest)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pctToNext}%`, background: levelMeta.color, borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Level pills */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: recent.length > 0 ? '1rem' : 0 }}>
        {LEVELS.map((l) => (
          <span
            key={l.name}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '0.25rem 0',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              background: l.name === level ? `${l.color}18` : 'transparent',
              color: l.name === level ? l.color : 'var(--color-on-surface-variant)',
              border: `1px solid ${l.name === level ? l.color + '30' : 'transparent'}`,
            }}
          >
            {l.label}
          </span>
        ))}
      </div>

      {/* Recent transactions */}
      {recent.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recent.map((tx) => (
            <li key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flex: 1, minWidth: 0 }}>
                {tx.note ?? EVENT_LABELS[tx.event] ?? tx.event}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-green)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                +{tx.points}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: recent.length > 0 ? '0.75rem' : '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--outline-variant)' }}>
        <Link
          href="/dashboard/points"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-accent)',
            textDecoration: 'none',
          }}
        >
          How to earn points
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>
    </div>
  );
}
