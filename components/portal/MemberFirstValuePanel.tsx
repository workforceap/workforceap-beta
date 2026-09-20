'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { FirstValueAction } from '@/lib/member/firstValueActions';
import { postMemberEvent } from '@/lib/events/client';
import { trackFunnelEvent } from '@/lib/analytics/events';

export default function MemberFirstValuePanel({
  actions,
  secondsSinceSignup,
}: {
  actions: FirstValueAction[];
  secondsSinceSignup?: number | null;
}) {
  const t = useTranslations('dashboard');

  useEffect(() => {
    if (actions.length === 0) return;

    trackFunnelEvent('member_dashboard', 'first_value_panel_rendered', {
      action_ids: actions.map((a) => a.id),
      seconds_since_signup: secondsSinceSignup ?? undefined,
    });
    void postMemberEvent({
      eventName: 'first_value_panel_rendered',
      sourcePage: '/dashboard',
      metadata: {
        action_ids: actions.map((a) => a.id),
        seconds_since_signup: secondsSinceSignup ?? undefined,
      },
    });
  }, [actions, secondsSinceSignup]);

  const trackClick = useCallback((action: FirstValueAction) => {
    trackFunnelEvent('member_dashboard', 'first_value_action_clicked', {
      action_id: action.id,
      href: action.href,
    });
    void postMemberEvent({
      eventName: 'member_dashboard_action_clicked',
      entityType: 'first_value_action',
      metadata: { action_id: action.id, href: action.href },
      sourcePage: '/dashboard',
    });
  }, []);

  if (actions.length === 0) return null;

  return (
    <section
      className="portal-dash-inset"
      aria-label={t('firstValuePanelTitle')}
      style={{ marginBottom: '1.5rem' }}
    >
      <PanelHeader t={t} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        {actions.map((action) => (
          <div
            key={action.id}
            className="portal-card portal-card--flat"
            style={{
              padding: '1rem',
              borderLeft: '4px solid var(--color-accent)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <h4
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                margin: 0,
                color: 'var(--color-on-surface)',
                lineHeight: 1.3,
              }}
            >
              {action.title}
            </h4>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-on-surface-variant)',
                lineHeight: 1.5,
                margin: 0,
                flex: 1,
              }}
            >
              {action.body}
            </p>
            <Link
              href={action.href}
              className="btn btn-primary"
              onClick={() => trackClick(action)}
              style={{
                alignSelf: 'flex-start',
                fontSize: '0.85rem',
                padding: '0.55rem 1rem',
                textDecoration: 'none',
                marginTop: '0.25rem',
              }}
            >
              {action.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function PanelHeader({ t }: { t: ReturnType<typeof useTranslations<'dashboard'>> }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '0.75rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <h3
        style={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface-variant)',
          margin: 0,
        }}
      >
        {t('firstValuePanelTitle')}
      </h3>
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
        {t('firstValuePanelSubtitle')}
      </span>
    </div>
  );
}
