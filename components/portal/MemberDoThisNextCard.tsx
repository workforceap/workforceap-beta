'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import type { NextBestAction } from '@/lib/member/nextBestActions';
import { resolveMemberProgramHref } from '@/lib/member/memberProgramHref';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { postMemberEvent } from '@/lib/events/client';
import { MemberTaskRow, WhatNext, splitLead } from '@/components/portal/kit/pages/member/MemberTaskRow';
import styles from './MemberDoThisNextCard.module.css';

/** Only persisted actions have an entity ID that can be explicitly dismissed. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberDoThisNextCardProps = {
  action: NextBestAction | null;
  /** `row` renders inside the member home's ordered This week list. */
  variant?: 'card' | 'row';
  rowState?: 'current' | 'todo';
  /** Development fixtures navigate locally without telemetry or DB writes. */
  previewOnly?: boolean;
};

/**
 * A click opens the suggested destination; it is not evidence of completion.
 * Persisted suggestions leave only through the separate, explicit dismiss
 * action. Synthetic fixture actions have no dismiss control.
 */
export default function MemberDoThisNextCard({ action, variant = 'card', rowState = 'current', previewOnly = false }: MemberDoThisNextCardProps) {
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
    if (dismissing || previewOnly) return;
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
    if (previewOnly) return;
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

  const dismissControl = UUID_RE.test(actionId) && !previewOnly ? (
    <button
      type="button"
      className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
      disabled={dismissing}
      onClick={() => void dismissSuggestion()}
    >
      {dismissing ? t('dismissingSuggestion') : t('dismissSuggestion')}
    </button>
  ) : null;

  if (variant === 'row') {
    const { lead, rest } = splitLead(action.body);
    return (
      <MemberTaskRow
        state={rowState}
        testId="member-today-row"
        title={action.title}
        sub={lead}
        trailing={(
          <span className={styles.rowActions}>
            <Link href={actionHref} onClick={handleCtaClick} className="wa-kit-cta wa-kit-focus">
              {action.cta} <ArrowRight size={14} aria-hidden />
            </Link>
            {dismissControl}
          </span>
        )}
      >
        {dismissErrorId === actionId ? <p role="alert" className={styles.dismissError}>{t('dismissSuggestionError')}</p> : null}
        {rest ? <WhatNext label={t('home.whatNext')}><p>{rest}</p></WhatNext> : null}
      </MemberTaskRow>
    );
  }

  return (
    <section aria-label={t('todayFocus')}>
      <div className={`wa-kit-card wa-kit-card--accent-edge ${styles.card}`}>
        <div className={styles.cardHead}>
          <p className={styles.eyebrow}>{t('todayFocus')}</p>
          {dismissControl}
        </div>
        {dismissErrorId === actionId ? <p role="alert" className={styles.dismissError}>{t('dismissSuggestionError')}</p> : null}
        <h2 className={`h-font ${styles.title}`}>{action.title}</h2>
        <p className={`wa-kit-lede ${styles.body}`}>{action.body}</p>
        <Link href={actionHref} onClick={handleCtaClick} className={`wa-kit-cta wa-kit-focus ${styles.cta}`}>
          {action.cta} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
