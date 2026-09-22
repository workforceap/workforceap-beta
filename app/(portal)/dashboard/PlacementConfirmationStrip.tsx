'use client';

import { useState } from 'react';
import { confirmPlacement, type ConfirmPlacementResult } from './placementAction';

type PlacementOutcome = ConfirmPlacementResult['placementOutcome'];

/**
 * What the member reads after confirming. Each line is true only for its
 * outcome: a first confirmation logs a member-reported placement and alerts
 * the counselor; a repeat finds the placement already on record and sends
 * nothing new; a failed record write keeps the confirmation itself (the claim
 * event still reaches staff) but logs no placement.
 */
const ACKNOWLEDGEMENT: Record<PlacementOutcome, { heading: string; body: string; icon: string }> = {
  created: {
    heading: 'Placement logged',
    body: 'Logged as a placement you reported. Your counselor has been alerted to confirm the start date and pay.',
    icon: 'check_circle',
  },
  corroborated: {
    heading: 'Placement logged',
    body: 'Logged as a placement you reported. Your counselor has been alerted to confirm the start date and pay.',
    icon: 'check_circle',
  },
  unchanged: {
    heading: 'Already on record',
    body: 'Your placement is already on record from an earlier confirmation, so nothing new was sent to your counselor. Let them know if the details have changed.',
    icon: 'task_alt',
  },
  failed: {
    heading: 'Saved for review',
    body: 'We saved your confirmation, but the placement could not be logged automatically. It is flagged for your team to review.',
    icon: 'flag',
  },
};

export default function PlacementConfirmationStrip({ offers }: { offers: any[] }) {
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

  const handleDismiss = (offerId: string) => {
    setDismissed(prev => ({ ...prev, [offerId]: true }));
  };

  return (
    <section style={{ padding: '0 1.25rem', marginBottom: '1.25rem' }} aria-live="polite">
      {activeOffers.map(offer => {
        const outcome = acknowledged[offer.id];
        if (outcome) {
          const ack = ACKNOWLEDGEMENT[outcome];
          return (
            <div key={offer.id} role="status" style={{ borderRadius: '1rem', overflow: 'hidden', background: 'var(--wa-success-dark)', boxShadow: '0 6px 24px color-mix(in srgb, var(--wa-success) 30%, transparent)', marginBottom: '1rem' }}>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-on-success)', fontVariationSettings: "'FILL' 1", flexShrink: 0 }} aria-hidden>{ack.icon}</span>
                <div>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--wa-on-success)', margin: '0 0 0.25rem' }}>
                    {ack.heading} — {offer.company}
                  </p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--wa-on-success)', margin: 0, lineHeight: 1.5 }}>{ack.body}</p>
                </div>
              </div>
            </div>
          );
        }
        return (
        <div key={offer.id} style={{ borderRadius: '1rem', overflow: 'hidden', background: 'var(--wa-success-dark)', boxShadow: '0 6px 24px color-mix(in srgb, var(--wa-success) 30%, transparent)', marginBottom: '1rem' }}>
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--wa-on-success)', margin: '0 0 0.35rem' }}>Job Offer</p>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--wa-on-success)', margin: 0, lineHeight: 1.3 }}>
                  Did you accept the role at {offer.company}?
                </h2>
              </div>
              <span className="material-symbols-outlined" style={{ color: 'var(--wa-on-success)', fontVariationSettings: "'FILL' 1", flexShrink: 0, marginLeft: '0.5rem' }} aria-hidden>work</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--wa-on-success)', margin: 0, lineHeight: 1.5 }}>
              Let WorkforceAP know you accepted the offer. We log it as a placement you reported and alert your counselor to confirm the start date and pay — your support and access do not change.
            </p>
            {errors[offer.id] ? (
              <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-on-success)', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
                {errors[offer.id]}
              </p>
            ) : null}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button"
                onClick={() => handleConfirm(offer.id)}
                disabled={loading[offer.id]}
                style={{ flex: 1, display: 'block', width: '100%', background: 'var(--wa-on-success)', color: 'var(--wa-success-dark)', padding: '0.75rem', borderRadius: '0.625rem', textDecoration: 'none', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', boxSizing: 'border-box', border: 'none', cursor: 'pointer' }}
              >
                {loading[offer.id] ? 'Sending update...' : 'Yes — notify my team'}
              </button>
              <button type="button"
                onClick={() => handleDismiss(offer.id)}
                disabled={loading[offer.id]}
                style={{ flex: 1, display: 'block', width: '100%', background: 'transparent', color: 'var(--wa-on-success)', padding: '0.75rem', borderRadius: '0.625rem', textDecoration: 'none', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', boxSizing: 'border-box', border: '1.5px solid var(--wa-on-success)', cursor: 'pointer' }}
              >
                Not right now
              </button>
            </div>
          </div>
        </div>
        );
      })}
    </section>
  );
}
