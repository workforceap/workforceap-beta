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
};

/**
 * Single dominant "Today" CTA on the kit member home (MemberHomeKit), painted
 * with the portal `--wa-*` tokens and `wa-kit-*` classes. Its pre-kit styling
 * went with the retired `?ui=legacy` home (WAP-195).
 *
 * Acting on the CTA marks the action `COMPLETED` — the CTA is the clearing
 * gesture, since the card has no dismiss affordance. Without this the banner
 * would be permanent, as nothing else clears a non-CareerOS action.
 */
export default function MemberDoThisNextCard({ action }: MemberDoThisNextCardProps) {
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
            background: 'var(--wa-hero-action-bg)',
            color: 'var(--wa-hero-action-text)',
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
