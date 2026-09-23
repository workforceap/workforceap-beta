'use client';

import { useState } from 'react';
import { Briefcase, CheckCircle2, CircleCheckBig, Flag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx, toneClass } from '@/components/portal/kit';
import { confirmPlacement, type ConfirmPlacementResult } from './placementAction';

type PlacementOutcome = ConfirmPlacementResult['placementOutcome'];

/**
 * What the member reads after confirming. Each line is true only for its
 * outcome: a first confirmation logs a member-reported placement and alerts
 * the counselor; a repeat finds the placement already on record and sends
 * nothing new; a failed record write keeps the confirmation itself (the claim
 * event still reaches staff) but logs no placement. The tone says the same
 * thing: `ok` when a placement is on record, `warn` when it waits on staff.
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

type PlacementConfirmationStripProps = {
  offers: any[];
  /**
   * Where the strip sits. Both variants draw the same kit cards (WAP-194:
   * `--wa-*` tokens, lucide icons, the success tone edge); only the outer
   * spacing differs. `legacy` (the default, `?ui=legacy` home) keeps its
   * own 1.25rem gutter and bottom margin. `kit` drops both: the kit home's
   * column already sets the inline edge and the gap between cards
   * (`wa-space-y-6`), so the offer card lines up with the kit cards around it
   * and stacked offers keep 1rem between them without a trailing margin.
   */
  variant?: 'legacy' | 'kit';
};

export default function PlacementConfirmationStrip({ offers, variant = 'legacy' }: PlacementConfirmationStripProps) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, PlacementOutcome>>({});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!offers || offers.length === 0) return null;

  // Dismissed offers leave for the session; confirmed ones stay as a short
  // acknowledgement so the member sees what actually happened.
  const activeOffers = offers.filter(o => !dismissed[o.id]);

  if (activeOffers.length === 0) return null;

  const handleConfirm = async (offerId: string) => {
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

  // Legacy spaces stacked cards with a bottom margin; the kit section's grid gap does it instead.
  const cardMarginBottom = variant === 'kit' ? undefined : '1rem';

  const handleDismiss = (offerId: string) => {
    setDismissed(prev => ({ ...prev, [offerId]: true }));
  };

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
                  {ack.heading} — {offer.company}
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
              Let WorkforceAP know you accepted the offer. We log it as a placement you reported and alert your counselor to confirm the start date and pay — your support and access do not change.
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
                disabled={loading[offer.id]}
                className="wa-kit-cta wa-kit-focus"
                style={{ flex: '1 1 12rem' }}
              >
                {loading[offer.id] ? 'Sending update...' : 'Yes — notify my team'}
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
        </div>
        );
      })}
    </section>
  );
}
