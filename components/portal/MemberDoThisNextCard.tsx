'use client';

import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import type { NextBestAction } from '@/lib/member/nextBestActions';
import { resolveMemberProgramHref } from '@/lib/member/memberProgramHref';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { postMemberEvent } from '@/lib/events/client';

/** Persisted MemberNextBestAction rows have UUID ids; synthetic ones don't and can't be PATCHed. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberDoThisNextCardProps = {
  action: NextBestAction | null;
  /** Horizontal padding for section wrapper (default matches desktop dashboard gutter). Ignored by `variant="kit"`, which is placed inside an already-padded container. */
  paddingX?: string;
  /**
   * 'legacy' (default) renders the original dashboard styling used by
   * `?ui=legacy` (DashboardHomeClient / mobile). 'kit' renders with portal
   * `--wa-*` tokens and `wa-kit-*` classes for MemberHomeKit.
   */
  variant?: 'legacy' | 'kit';
};

/**
 * Single dominant dashboard CTA — one "Today" action above secondary next-step strips.
 *
 * Acting on the CTA marks the action `COMPLETED`, mirroring the featured card in
 * `MemberNextStepsStrip` (which has no dismiss affordance either — the CTA is the
 * clearing gesture). Without this the banner is permanent on the kit dashboard,
 * where the strip isn't mounted and nothing else clears a non-CareerOS action.
 */
export default function MemberDoThisNextCard({ action, paddingX = '2rem', variant = 'legacy' }: MemberDoThisNextCardProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [completed, setCompleted] = useState(false);
  if (!action || completed) return null;

  const actionId = action.id;
  const actionHref = resolveMemberProgramHref(action.href);

  const completeAndOpen = async () => {
    try {
      const response = await fetch(`/api/member/nba/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      setCompleted(false);
      // Keep the unsaved action visible, but still open its destination.
    }
    router.push(actionHref);
  };

  const handleCtaClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackFunnelEvent('member_dashboard', 'dashboard_primary_cta_clicked', {
      action_id: action.id,
      action_label: action.cta,
      href: actionHref,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
    void postMemberEvent({
      eventName: 'member_dashboard_action_clicked',
      entityType: 'next_best_action',
      entityId: UUID_RE.test(actionId) ? actionId : undefined,
      sourcePage: '/dashboard',
      metadata: {
        action: 'dashboard_primary_cta_clicked',
        action_id: action.id,
        action_label: action.cta,
        href: actionHref,
      },
    });

    if (!UUID_RE.test(actionId)) return;
    event.preventDefault();
    setCompleted(true);
    void completeAndOpen();
  };

  if (variant === 'kit') {
    return (
      <section aria-label={t('todayFocus')}>
        <div
          className="wa-kit-card wa-kit-card--gradient-crimson"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--wa-shadow-lg)' }}
        >
          <div
            className="wa-flex wa-items-center wa-gap-2"
            style={{ color: 'color-mix(in srgb, var(--wa-on-accent) 85%, transparent)' }}
          >
            <span className="wa-kit-meta" style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'inherit' }}>
              {t('todayFocus')}
            </span>
          </div>
          <h2
            className="h-font"
            style={{
              fontSize: 'clamp(1.05rem, 3.2vw, 1.375rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--wa-on-accent)',
              margin: 0,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {action.title}
          </h2>
          <p
            className="wa-kit-lede"
            style={{
              color: 'color-mix(in srgb, var(--wa-on-accent) 90%, transparent)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {action.body}
          </p>
          <Link
            href={actionHref}
            onClick={handleCtaClick}
            className="wa-kit-focus"
            style={{
              marginTop: 4,
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              minHeight: 44,
              background: 'var(--wa-on-accent)',
              color: 'var(--wa-accent)',
              fontWeight: 700,
              fontSize: 'var(--wa-type-body)',
              borderRadius: 999,
              textDecoration: 'none',
              maxWidth: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {action.cta} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section style={{ padding: `0 ${paddingX}`, marginBottom: '1.5rem' }} aria-label={t('todayFocus')}>
      <div
        style={{
          borderRadius: 'var(--wa-radius)',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--wa-accent-dark), var(--wa-accent))',
          boxShadow: 'var(--wa-shadow-lg)',
        }}
      >
        <div style={{ padding: '1.35rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <p
            style={{
              fontSize: 'var(--wa-type-meta)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: 'color-mix(in srgb, var(--wa-on-accent) 82%, transparent)',
              margin: 0,
            }}
          >
            {t('todayFocus')}
          </p>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--wa-on-accent)',
              margin: 0,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {action.title}
          </h2>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'color-mix(in srgb, var(--wa-on-accent) 90%, transparent)',
              margin: 0,
              lineHeight: 1.55,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {action.body}
          </p>
          <Link
            href={actionHref}
            className="btn"
            onClick={handleCtaClick}
            style={{
              marginTop: '0.25rem',
              alignSelf: 'flex-start',
              background: 'var(--wa-on-accent)',
              color: 'var(--wa-accent)',
              fontWeight: 700,
              border: 'none',
              textDecoration: 'none',
              maxWidth: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {action.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
