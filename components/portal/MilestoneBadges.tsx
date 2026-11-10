import type { CSSProperties } from 'react';
import { Award, ClipboardCheck, FileText, Flame, GraduationCap, Lock, Search } from 'lucide-react';
import { StatusTag } from '@/components/portal/kit';
import { BADGES, type BadgeKey, type MemberBadge } from '@/lib/member/badgesConfig';
import { WIRED_EVENTS as POINTS_WIRED_EVENTS } from '@/lib/member/pointsConfig';

/**
 * A badge renders only when a member can earn it today. Event badges must
 * sit in the points page's WIRED_EVENTS set. The streak badge has no event
 * of its own: awardPoints() calls updateStreak on every awarded event, and
 * `daily_study` stays in this set so a study-only day still shows the badge.
 */
export const WIRED_EVENTS = new Set<string>(
  BADGES.flatMap((badge) => (badge.event ? [badge.event] : [])).filter((event) => POINTS_WIRED_EVENTS.has(event)),
);
WIRED_EVENTS.add('daily_study');

const ICONS: Record<BadgeKey, typeof Award> = {
  ready_to_start: ClipboardCheck,
  resume_ready: FileText,
  job_hunter: Search,
  first_course: GraduationCap,
  certified: Award,
  streak_7: Flame,
};

const earnedDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function visibleBadges(badges: MemberBadge[]): MemberBadge[] {
  const allowed = new Set(
    BADGES.filter((def) => !def.event || WIRED_EVENTS.has(def.event)).map((def) => def.key),
  );
  return badges.filter((badge) => allowed.has(badge.key));
}

function progressLabel(badge: MemberBadge): string {
  return `${Math.min(badge.have, badge.need)} of ${badge.need}`;
}

export default function MilestoneBadges({
  badges,
  variant = 'grid',
  currentStreak = 0,
  longestStreak = 0,
}: {
  badges: MemberBadge[];
  variant?: 'grid' | 'compact';
  currentStreak?: number;
  longestStreak?: number;
}) {
  const shown = visibleBadges(badges);
  const earned = shown.filter((badge) => badge.earned);

  if (variant === 'compact') {
    return (
      <section aria-label="Milestone badges" data-milestone-badges="compact" className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
        {earned.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--wa-muted)' }}>No badges earned yet.</p>
        ) : (
          <ul style={{ display: 'contents', listStyle: 'none', margin: 0, padding: 0 }}>
            {earned.map((badge) => {
              const Icon = ICONS[badge.key];
              return (
                <li key={badge.key}>
                  <StatusTag tone="ok">
                    <span className="wa-inline-flex wa-items-center wa-gap-1">
                      <Icon size={14} aria-hidden />
                      {badge.label}
                    </span>
                  </StatusTag>
                </li>
              );
            })}
          </ul>
        )}
        <StreakLine currentStreak={currentStreak} longestStreak={longestStreak} />
      </section>
    );
  }

  return (
    <div>
      {earned.length === 0 ? (
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--wa-muted)' }}>No badges earned yet.</p>
      ) : null}
      {shown.length > 0 ? (
        <ul
          aria-label="Milestone badges"
          data-milestone-badges="grid"
          className="wa-grid wa-grid-cols-1 wa-gap-3"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {shown.map((badge) => (
            <BadgeCard key={badge.key} badge={badge} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BadgeCard({ badge }: { badge: MemberBadge }) {
  const Icon = ICONS[badge.key];
  const date = badge.earned && badge.earnedAt ? earnedDate.format(new Date(badge.earnedAt)) : null;
  const tile: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    minWidth: 0,
    padding: '0.875rem 1rem',
    border: '1px solid var(--wa-border)',
    borderRadius: 'var(--wa-radius-sm)',
    background: badge.earned ? 'color-mix(in srgb, var(--wa-gold) 8%, transparent)' : 'transparent',
  };
  return (
    <li aria-label={badge.label} style={tile}>
      <span
        aria-hidden
        className="wa-inline-flex wa-items-center wa-justify-center"
        style={{
          width: 36,
          height: 36,
          flex: 'none',
          borderRadius: 'var(--wa-radius-sm)',
          background: badge.earned ? 'var(--wa-gold-soft)' : 'var(--wa-track)',
          color: badge.earned ? 'var(--wa-gold-dark)' : 'var(--wa-muted)',
        }}
      >
        {badge.earned ? <Icon size={18} /> : <Lock size={16} />}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="wa-flex wa-flex-wrap wa-items-center wa-gap-2">
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--wa-text)' }}>{badge.label}</span>
          <StatusTag tone={badge.earned ? 'ok' : 'muted'}>{badge.earned ? 'Earned' : 'Locked'}</StatusTag>
        </span>
        <span style={{ display: 'block', marginTop: 2, fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
          {badge.description}
        </span>
        <span
          style={{ display: 'block', marginTop: 4, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-text)', fontVariantNumeric: 'tabular-nums' }}
        >
          {badge.earned ? (date ? `Earned ${date}` : 'Earned') : progressLabel(badge)}
        </span>
      </span>
    </li>
  );
}

function StreakLine({ currentStreak, longestStreak }: { currentStreak: number; longestStreak: number }) {
  const active = currentStreak > 0;
  return (
    <span className="wa-inline-flex wa-items-center wa-gap-2" style={{ fontSize: '0.8125rem', color: 'var(--wa-text)' }}>
      <Flame size={14} aria-hidden />
      <span style={{ fontWeight: 700 }}>{active ? `${currentStreak}-day streak` : 'No active streak'}</span>
      <span style={{ color: 'var(--wa-muted)' }}>
        {longestStreak > 0 ? `Best: ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}` : 'Start today'}
      </span>
    </span>
  );
}
