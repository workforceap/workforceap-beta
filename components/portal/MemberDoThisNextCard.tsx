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
import { MemberTaskRow, WhatNext, splitLead } from '@/components/portal/kit/pages/member/MemberTaskRow';
import styles from './MemberDoThisNextCard.module.css';

/** Persisted MemberNextBestAction rows have UUID ids; synthetic ones don't and can't be PATCHed. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberDoThisNextCardProps = {
  action: NextBestAction | null;
  /**
   * `card` (default) is the standalone "Today" card. `row` renders the action
   * as the first row of the member home "This week" list: a `<li>` with the
   * title, one subline, and the CTA as the row action. It must sit inside an
   * `<ol>`. Both variants run the same CTA handler (events + COMPLETED write).
   */
  variant?: 'card' | 'row';
  /** Row variant only: `current` (crimson ring) for the first row, `todo` otherwise. */
  rowState?: 'current' | 'todo';
};

/**
 * Single dominant "Today" CTA on the kit member home (MemberHomeKit): a calm
 * hairline card with the 3px crimson edge and one crimson pill, painted with
 * the portal `--wa-*` tokens and `wa-kit-*` classes. Its pre-kit styling
 * went with the retired `?ui=legacy` home (WAP-195).
 *
 * Acting on the CTA marks the action `COMPLETED` — the CTA is the clearing
 * gesture, since the card has no dismiss affordance. Without this the banner
 * would be permanent, as nothing else clears a non-CareerOS action.
 */
export default function MemberDoThisNextCard({ action, variant = 'card', rowState = 'current' }: MemberDoThisNextCardProps) {
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

  if (variant === 'row') {
    // One line on the row; whatever follows the first sentence of a long body
    // moves into "What happens next" (nothing is dropped).
    const { lead, rest } = splitLead(action.body);
    return (
      <MemberTaskRow
        state={rowState}
        testId="member-today-row"
        title={action.title}
        sub={lead}
        trailing={
          <Link
            href={actionHref}
            onClick={handleCtaClick}
            className="wa-kit-cta wa-kit-focus"
          >
            {action.cta} <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        {rest ? (
          <WhatNext label={t('home.whatNext')}>
            <p>{rest}</p>
          </WhatNext>
        ) : null}
      </MemberTaskRow>
    );
  }

  return (
    <section aria-label={t('todayFocus')}>
      <div className={`wa-kit-card wa-kit-card--accent-edge ${styles.card}`}>
        <p className={styles.eyebrow}>{t('todayFocus')}</p>
        <h2
          className={`h-font ${styles.title}`}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {action.title}
        </h2>
        {/* WAP-253: no line clamp here; the body often ends with the due date. */}
        <p className={`wa-kit-lede ${styles.body}`} style={{ margin: 0, color: 'var(--wa-muted)' }}>
          {action.body}
        </p>
        <Link
          href={actionHref}
          onClick={handleCtaClick}
          className={`wa-kit-cta wa-kit-focus ${styles.cta}`}
        >
          {action.cta} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
