'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { NextBestAction } from '@/lib/member/nextBestActions';
import { postMemberEvent } from '@/lib/events/client';
import { trackFunnelEvent } from '@/lib/analytics/events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MemberNextStepsStrip({
  actions,
  compact = false,
  fillRow = false,
  /** When secondary, demote visually under the primary Today card (still actionable). */
  prominence = 'primary',
}: {
  actions: NextBestAction[];
  compact?: boolean;
  /** When one card: stretch to full width so the grid does not look half-empty */
  fillRow?: boolean;
  prominence?: 'primary' | 'secondary';
}) {
  const t = useTranslations('dashboard');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const router = useRouter();

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    if (!UUID_RE.test(id)) return;
    // Optimistic: hide the card now, but put it back if the server did not
    // record the dismissal — otherwise it silently reappears on the next load.
    const restore = (reason: unknown) => {
      console.error('[member-next-steps] dismiss failed', reason);
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
    fetch(`/api/member/nba/${id}`, { method: 'PATCH' })
      .then((res) => {
        if (!res.ok) restore(`HTTP ${res.status}`);
      })
      .catch(restore);
  }, []);

  const trackClick = useCallback((id: string, href: string, label: string) => {
    void postMemberEvent({
      eventName: 'member_dashboard_action_clicked',
      entityType: 'next_best_action',
      entityId: UUID_RE.test(id) ? id : undefined,
      metadata: { action_id: id, href },
      sourcePage: '/dashboard',
    });
    trackFunnelEvent('member_dashboard', 'primary_cta_clicked', {
      action_id: id,
      action_label: label,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
  }, []);

  const completeAndOpen = useCallback(async (id: string, href: string, label: string) => {
    trackClick(id, href, label);
    if (!UUID_RE.test(id)) {
      router.push(href);
      return;
    }

    setDismissed((prev) => new Set([...prev, id]));
    try {
      const response = await fetch(`/api/member/nba/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Keep the unsaved action visible, but still open its destination.
    }
    router.push(href);
  }, [router, trackClick]);

  const visible = actions.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const isSecondary = prominence === 'secondary';
  // Product stake: when there is one clear next step and this strip is primary,
  // emphasize it so the dashboard feels guided. Secondary strips stay quieter
  // under the Today card.
  const isFeatured = !isSecondary && fillRow && visible.length === 1 && !compact;

  return (
    <section
      style={{
        marginBottom: compact || isSecondary ? '1rem' : '2rem',
        padding: compact ? '0' : undefined,
        opacity: isSecondary ? 0.92 : 1,
      }}
      aria-label={isSecondary ? t('alsoForYou') : undefined}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: compact || isSecondary ? '0.65rem' : '1rem',
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{
            fontSize: isSecondary ? '0.7rem' : compact ? '0.75rem' : '0.8rem',
            fontWeight: isSecondary ? 600 : 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--wa-muted)',
            margin: 0,
          }}
        >
          {isSecondary ? t('alsoForYou') : isFeatured ? t('recommendedNextStep') : t('yourNextStepsTitle')}
        </h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--wa-muted)' }}>
          {isSecondary ? t('alsoForYouHint') : isFeatured ? t('startHereBasedOnProgress') : t('pickedForYou')}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            fillRow && visible.length === 1
              ? '1fr'
              : compact || isSecondary
                ? 'repeat(auto-fill, minmax(200px, 1fr))'
                : 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: compact || isSecondary ? '0.65rem' : '1rem',
        }}
      >
        {visible.map((a) => (
          <div
            key={a.id}
            className="portal-card portal-card--flat"
            style={{
              padding: compact || isSecondary ? '0.85rem' : isFeatured ? '1.25rem' : '1rem',
              borderLeft: isSecondary
                ? '1px solid var(--wa-border)'
                : a.variant === 'urgent' || isFeatured
                  ? '4px solid var(--wa-accent)'
                  : '1px solid var(--wa-border)',
              background: isFeatured
                ? 'color-mix(in srgb, var(--wa-accent) 7%, var(--wa-surface))'
                : isSecondary
                  ? 'var(--wa-surface)'
                  : undefined,
              display: 'flex',
              flexDirection: 'column',
              gap: isFeatured ? '0.65rem' : '0.5rem',
              minHeight: compact ? 'auto' : undefined,
              position: 'relative',
              boxShadow: isFeatured ? 'var(--wa-shadow)' : undefined,
            }}
          >
            {!isFeatured && (
              <button
                type="button"
                aria-label={t('dismissAction', { title: a.title })}
                onClick={() => dismiss(a.id)}
                style={{
                  position: 'absolute',
                  top: compact ? '0.25rem' : '0.35rem',
                  right: compact ? '0.25rem' : '0.35rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--wa-muted)',
                  fontSize: '1rem',
                  lineHeight: 1,
                  padding: '0.75rem',
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  opacity: 0.6,
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem' }}>
                  close
                </span>
              </button>
            )}
            {isFeatured && (
              <span
                style={{
                  alignSelf: 'flex-start',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'var(--wa-accent)',
                  color: 'var(--wa-on-accent)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {t('startHere')}
              </span>
            )}
            <h4
              style={{
                fontWeight: isSecondary ? 600 : 700,
                fontSize: compact || isSecondary ? '0.9rem' : isFeatured ? '1.1rem' : '0.95rem',
                margin: 0,
                color: 'var(--wa-text)',
                lineHeight: 1.3,
                paddingRight: isFeatured ? '0' : '1.5rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {a.title}
            </h4>
            <p
              style={{
                fontSize: compact || isSecondary ? '0.8125rem' : isFeatured ? '0.95rem' : '0.875rem',
                color: 'var(--wa-muted)',
                lineHeight: 1.5,
                margin: 0,
                flex: 1,
                maxWidth: isFeatured ? '42rem' : undefined,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: isSecondary ? 2 : 3,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {a.body}
            </p>
            <Link
              href={a.href}
              className={isSecondary ? 'btn btn-muted' : 'btn btn-primary'}
              onClick={(e) => {
                if (!UUID_RE.test(a.id)) {
                  trackClick(a.id, a.href, a.cta);
                  return;
                }
                e.preventDefault();
                void completeAndOpen(a.id, a.href, a.cta);
              }}
              style={{
                alignSelf: 'flex-start',
                fontSize: compact || isSecondary ? '0.8rem' : isFeatured ? '0.9rem' : '0.85rem',
                padding: compact || isSecondary ? '0.5rem 0.85rem' : isFeatured ? '0.65rem 1.1rem' : '0.55rem 1rem',
                textDecoration: 'none',
                marginTop: '0.25rem',
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
