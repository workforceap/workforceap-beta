'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, CheckCircle2, CircleCheckBig, Flag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx, toneClass } from '@/components/portal/kit';
import { MemberTaskRow, TaskRowActions, WhatNext, splitLead, type TaskRowState } from '@/components/portal/kit/pages/member/MemberTaskRow';
import { confirmPlacement, type ConfirmPlacementResult } from './placementAction';

type PlacementOutcome = ConfirmPlacementResult['placementOutcome'];

/**
 * What the member reads after confirming. Each line is true only for its
 * outcome: a first confirmation logs a member-reported placement and alerts
 * the counselor; a repeat finds the placement already on record and sends
 * nothing new; a failed record write keeps the confirmation itself (the claim
 * event still reaches staff) but logs no placement. The tone says the same
 * thing: `ok` when a placement is on record, `warn` when it waits on staff.
 *
 * These English lines serve the `legacy` and `kit` card variants. The `row`
 * variant (the member home "This week" list) reads the same four outcomes from
 * `dashboard.home.placement.ack.*`, translated.
 */
const ACKNOWLEDGEMENT: Record<PlacementOutcome, { heading: string; body: string; icon: LucideIcon; tone: 'ok' | 'warn' }> = {
  created: {
    heading: 'Placement logged',
    body: 'Logged as a placement you reported. Your counselor has been alerted to confirm the start date and pay.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  corroborated: {
    heading: 'Placement logged',
    body: 'Logged as a placement you reported. Your counselor has been alerted to confirm the start date and pay.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  unchanged: {
    heading: 'Already on record',
    body: 'Your placement is already on record from an earlier confirmation, so nothing new was sent to your counselor. Let them know if the details have changed.',
    icon: CircleCheckBig,
    tone: 'ok',
  },
  failed: {
    heading: 'Saved for review',
    body: 'We saved your confirmation, but the placement could not be logged automatically. It is flagged for your team to review.',
    icon: Flag,
    tone: 'warn',
  },
};

/**
 * Kicker line above a card's heading. Text-on-surface uses the `-dark` text
 * token of the card's tone (`--wa-success` itself is a fill colour, 3.5:1 on
 * white); the warn acknowledgement swaps in `--wa-gold-dark`.
 */
const KICKER = {
  fontSize: 'var(--wa-type-meta)',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--wa-success-dark)',
  margin: 0,
} as const;

type PlacementOffer = { id: string; role?: string; company: string };

type PlacementConfirmationStripProps = {
  offers: any[];
  /**
   * Where the strip sits. `legacy` and `kit` draw the same kit cards (WAP-194:
   * `--wa-*` tokens, lucide icons, the success tone edge); only the outer
   * spacing differs. `legacy` (the default, `?ui=legacy` home) keeps its
   * own 1.25rem gutter and bottom margin. `kit` drops both: the kit home's
   * column already sets the inline edge and the gap between cards
   * (`wa-space-y-6`), so the offer card lines up with the kit cards around it
   * and stacked offers keep 1rem between them without a trailing margin.
   *
   * `row` is the member home "This week" list: each offer is one `<li>` task
   * row (the question, one subline, Yes / Not yet inline, and the longer
   * explanation under "What happens next"). It must sit inside an `<ol>` and
   * renders no section of its own.
   */
  variant?: 'legacy' | 'kit' | 'row';
  /** Row variant only: the dot state of an unanswered offer row. */
  rowState?: Exclude<TaskRowState, 'done'>;
  /** Disables placement writes in local development fixtures. */
  previewOnly?: boolean;
};

/** Confirm / dismiss state shared by every variant. */
function usePlacementOffers(previewOnly = false) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, PlacementOutcome>>({});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleConfirm = async (offerId: string) => {
    if (previewOnly) return;
    setLoading(prev => ({ ...prev, [offerId]: true }));
    setErrors(prev => ({ ...prev, [offerId]: '' }));
    try {
      const result = await confirmPlacement(offerId);
      setAcknowledged(prev => ({ ...prev, [offerId]: result.placementOutcome }));
    } catch (err) {
      console.error(err);
      setErrors(prev => ({ ...prev, [offerId]: 'Failed to confirm placement. Please try again.' }));
    }
    setLoading(prev => ({ ...prev, [offerId]: false }));
  };

  const handleDismiss = (offerId: string) => {
    setDismissed(prev => ({ ...prev, [offerId]: true }));
  };

  return { loading, acknowledged, dismissed, errors, handleConfirm, handleDismiss };
}

export default function PlacementConfirmationStrip({ offers, variant = 'legacy', rowState = 'todo', previewOnly = false }: PlacementConfirmationStripProps) {
  if (variant === 'row') return <PlacementOfferRows offers={offers} rowState={rowState} previewOnly={previewOnly} />;
  return <PlacementOfferCards offers={offers} variant={variant} previewOnly={previewOnly} />;
}

/** The member home task rows: one `<li>` per offer, translated. */
function PlacementOfferRows({ offers, rowState, previewOnly }: { offers: PlacementOffer[]; rowState: Exclude<TaskRowState, 'done'>; previewOnly: boolean }) {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common.disclosures');
  const { loading, acknowledged, dismissed, errors, handleConfirm, handleDismiss } = usePlacementOffers(previewOnly);

  if (!offers || offers.length === 0) return null;
  // Dismissed offers leave for the session; confirmed ones stay as a done row
  // so the member sees what actually happened.
  const activeOffers = offers.filter(o => !dismissed[o.id]);

  return (
    <>
      {activeOffers.map(offer => {
        const outcome = acknowledged[offer.id];
        if (outcome) {
          // The done row keeps one line: the first sentence of the acknowledgement.
          // What follows (who was alerted, what to do if the details changed) sits
          // under "What happens next"; nothing is dropped.
          const { lead, rest } = splitLead(t(`home.placement.ack.${outcome}.body`));
          return (
            <MemberTaskRow
              key={offer.id}
              state="done"
              live
              testId="member-offer-row"
              title={t(`home.placement.ack.${outcome}.title`, { company: offer.company })}
              sub={lead}
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
          <MemberTaskRow
            key={offer.id}
            state={rowState}
            testId="member-offer-row"
            title={t('home.placement.title', { company: offer.company })}
            sub={t('home.placement.sub')}
          >
            {errors[offer.id] ? (
              <p
                role="alert"
                style={{
                  margin: '8px 0 0',
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 700,
                  color: 'var(--wa-danger-text)',
                  background: 'var(--wa-danger-soft)',
                  borderRadius: 'var(--wa-radius-sm)',
                  padding: '8px 12px',
                }}
              >
                {t('home.placement.error')}
              </p>
            ) : null}
            <TaskRowActions>
              <button
                type="button"
                onClick={() => handleConfirm(offer.id)}
                disabled={loading[offer.id] || previewOnly}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                aria-label={t('home.placement.yesLabel')}
              >
                {loading[offer.id] ? t('home.placement.sending') : t('home.placement.yes')}
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(offer.id)}
                disabled={loading[offer.id]}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                aria-label={t('home.placement.noLabel')}
              >
                {t('home.placement.no')}
              </button>
              <WhatNext label={t('home.whatNext')}>
                <p>{t('home.placement.next')}</p>
                {previewOnly ? <p role="note">{tCommon('previewActionUnavailable')}</p> : null}
              </WhatNext>
            </TaskRowActions>
          </MemberTaskRow>
        );
      })}
    </>
  );
}

/** The standalone cards (`legacy` and `kit`); English copy, unchanged. */
function PlacementOfferCards({ offers, variant, previewOnly }: { offers: any[]; variant: 'legacy' | 'kit'; previewOnly: boolean }) {
  const tCommon = useTranslations('common.disclosures');
  const { loading, acknowledged, dismissed, errors, handleConfirm, handleDismiss } = usePlacementOffers(previewOnly);

  if (!offers || offers.length === 0) return null;

  // Dismissed offers leave for the session; confirmed ones stay as a short
  // acknowledgement so the member sees what actually happened.
  const activeOffers = offers.filter(o => !dismissed[o.id]);

  if (activeOffers.length === 0) return null;

  // Legacy spaces stacked cards with a bottom margin; the kit section's grid gap does it instead.
  const cardMarginBottom = variant === 'kit' ? undefined : '1rem';

  return (
    <section
      style={variant === 'kit' ? { display: 'grid', gap: '1rem' } : { padding: '0 1.25rem', marginBottom: '1.25rem' }}
      aria-live="polite"
    >
      {activeOffers.map(offer => {
        const outcome = acknowledged[offer.id];
        if (outcome) {
          const ack = ACKNOWLEDGEMENT[outcome];
          const AckIcon = ack.icon;
          return (
            <div
              key={offer.id}
              role="status"
              className={cx('wa-kit-card wa-kit-tone-edge', toneClass(ack.tone))}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: cardMarginBottom }}
            >
              <span className="wa-kit-tone-icon" aria-hidden>
                <AckIcon size={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...KICKER, color: ack.tone === 'warn' ? 'var(--wa-gold-dark)' : KICKER.color, marginBottom: 4 }}>
                  {ack.heading}: {offer.company}
                </p>
                <p className="wa-kit-lede" style={{ margin: 0, color: 'var(--wa-text)' }}>{ack.body}</p>
              </div>
            </div>
          );
        }
        return (
        <div
          key={offer.id}
          className={cx('wa-kit-card wa-kit-tone-edge', toneClass('ok'))}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: cardMarginBottom }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...KICKER, marginBottom: 4 }}>Job Offer</p>
                <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)', margin: 0, lineHeight: 1.3 }}>
                  Did you accept the role at {offer.company}?
                </h2>
              </div>
              <span className="wa-kit-tone-icon" aria-hidden>
                <Briefcase size={18} />
              </span>
            </div>
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              Let WorkforceAP know you accepted the offer. We log it as a placement you reported and alert your counselor to confirm the start date and pay. Your support and access do not change.
            </p>
            {errors[offer.id] ? (
              <p
                role="alert"
                style={{
                  margin: 0,
                  fontSize: 'var(--wa-type-meta)',
                  fontWeight: 700,
                  color: 'var(--wa-danger-text)',
                  background: 'var(--wa-danger-soft)',
                  borderRadius: 'var(--wa-radius-sm)',
                  padding: '8px 12px',
                }}
              >
                {errors[offer.id]}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button"
                onClick={() => handleConfirm(offer.id)}
                disabled={loading[offer.id] || previewOnly}
                className="wa-kit-cta wa-kit-focus"
                style={{ flex: '1 1 12rem' }}
              >
                {loading[offer.id] ? 'Sending update...' : 'Yes, notify my team'}
              </button>
              <button type="button"
                onClick={() => handleDismiss(offer.id)}
                disabled={loading[offer.id]}
                className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
                style={{ flex: '1 1 12rem' }}
              >
                Not right now
              </button>
            </div>
            {previewOnly ? <p role="note" style={{ margin: 0, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>{tCommon('previewActionUnavailable')}</p> : null}
        </div>
        );
      })}
    </section>
  );
}
