'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import type { NextBestAction } from '@/lib/member/nextBestActions';
import { resolveMemberProgramHref } from '@/lib/member/memberProgramHref';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { postMemberEvent } from '@/lib/events/client';

/** Only persisted actions have an entity ID for click telemetry. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberDoThisNextCardProps = {
  action: NextBestAction | null;
};

/**
 * Single dominant "Today" CTA on the kit member home (MemberHomeKit), painted
 * with the portal `--wa-*` tokens and `wa-kit-*` classes. Its pre-kit styling
 * went with the retired `?ui=legacy` home (WAP-195).
 *
 * Opening a destination is a click, not evidence that the member completed it.
 * Completion belongs to the successful workflow or a verified staff update.
 */
export default function MemberDoThisNextCard({ action }: MemberDoThisNextCardProps) {
  const t = useTranslations('dashboard');
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissErrorId, setDismissErrorId] = useState<string | null>(null);
  const dismissalStatus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (action?.id === dismissedId) dismissalStatus.current?.focus();
  }, [action?.id, dismissedId]);
  if (!action) return null;
  if (action.id === dismissedId) {
    return <p ref={dismissalStatus} role="status" tabIndex={-1} className="wa-kit-focus">{t('suggestionDismissed')}</p>;
  }

  const actionId = action.id;
  const actionHref = resolveMemberProgramHref(action.href);

  const dismissSuggestion = async () => {
    if (dismissing) return;
    setDismissing(true);
    setDismissErrorId(null);
    try {
      const response = await fetch(`/api/member/nba/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DISMISSED' }),
      });
      if (!response.ok) throw new Error('Suggestion dismissal failed');
      setDismissedId(actionId);
    } catch {
      setDismissErrorId(actionId);
    } finally {
      setDismissing(false);
    }
  };

  const handleCtaClick = () => {
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
  };

  return (
    <section aria-label={t('todayFocus')}>
      <div
        className="wa-kit-card wa-kit-card--gradient-crimson"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--wa-shadow-lg)' }}
      >
        <div
          className="wa-flex wa-items-center wa-gap-2"
          style={{ color: 'color-mix(in srgb, var(--wa-on-accent) 85%, transparent)', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <span className="wa-kit-meta" style={{ letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: 'inherit' }}>
            {t('todayFocus')}
          </span>
          {UUID_RE.test(actionId) && (
            <button
              type="button"
              className="wa-kit-focus"
              disabled={dismissing}
              onClick={() => void dismissSuggestion()}
              style={{ minHeight: 44, padding: '8px 12px', border: '1px solid currentColor', borderRadius: 'var(--wa-radius-sm)', background: 'transparent', color: 'var(--wa-on-accent)', fontSize: 'var(--wa-type-meta)', cursor: 'pointer' }}
            >
              {t('dismissSuggestion')}
            </button>
          )}
        </div>
        {dismissErrorId === actionId && <p role="alert" style={{ margin: 0, color: 'var(--wa-on-accent)' }}>{t('dismissSuggestionError')}</p>}
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
          }}
        >
          {/* WAP-253: no line clamp here; the body often ends with the due date. */}
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
