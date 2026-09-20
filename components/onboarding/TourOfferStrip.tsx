'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Route, X } from 'lucide-react';
import { useTour } from '@/components/onboarding/TourContext';
import { getTour, type TourKey } from '@/lib/tours/registry';

/**
 * First-login strip that offers a persona's guided tour (tours wave 2). The
 * server decides whether to render it (`getTourOffer` → `shouldOfferTour`); this
 * component only acts:
 *
 * - "Take the tour" starts the registry tour; the engine then records
 *   STARTED / COMPLETED / DISMISSED as usual.
 * - "Not now" persists DISMISSED at step 0 through the same `/api/tours/<key>`
 *   endpoint, so the strip never comes back on the next request (the Help menu
 *   is the way to reopen it).
 *
 * Copy: `tours.offer.*` plus the per-tour `tours.<role>.<page>.offer.*`.
 * Chrome on `--wa-*` tokens and kit CTA classes; `role="region"` so it is
 * discoverable, never a live region.
 */
export default function TourOfferStrip({ tourKey }: { tourKey: TourKey }) {
  const t = useTranslations('tours');
  const { start } = useTour();
  const [hidden, setHidden] = useState(false);
  const tour = getTour(tourKey);
  if (!tour || hidden) return null;

  const take = () => {
    setHidden(true);
    start(tour.key);
  };

  const dismiss = () => {
    setHidden(true);
    const sourcePage = typeof window !== 'undefined' ? window.location.pathname : undefined;
    void fetch(`/api/tours/${encodeURIComponent(tour.key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: tour.version, status: 'DISMISSED', lastStep: 0, ...(sourcePage ? { sourcePage } : {}) }),
      keepalive: true,
    }).catch(() => undefined);
  };

  const titleId = 'wa-tour-offer-title';
  return (
    <section
      aria-labelledby={titleId}
      data-testid="tour-offer-strip"
      data-tour-key={tour.key}
      style={{
        margin: 'clamp(0.75rem, 3vw, 1.25rem) clamp(1rem, 4vw, 1.5rem) 0',
        padding: '0.875rem 1rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.75rem 1rem',
        borderRadius: 'var(--wa-radius-sm)',
        background: 'var(--wa-accent-soft)',
        border: '1px solid var(--wa-border)',
        color: 'var(--wa-text)',
      }}
    >
      <Route size={20} aria-hidden style={{ color: 'var(--wa-accent)', flexShrink: 0 }} />
      <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--wa-type-body)', fontWeight: 700, lineHeight: 1.3 }}>
          {t(`${tour.key}.offer.title`)}
        </h2>
        <p style={{ margin: '0.125rem 0 0', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', lineHeight: 1.4 }}>
          {t(`${tour.key}.offer.body`)}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="wa-kit-cta" onClick={take} data-testid="tour-offer-take">
          {t('offer.take')}
        </button>
        <button type="button" className="wa-kit-cta wa-kit-cta--ghost" onClick={dismiss} data-testid="tour-offer-dismiss">
          <X size={14} aria-hidden style={{ marginRight: 4, verticalAlign: 'middle' }} />
          {t('offer.dismiss')}
        </button>
      </div>
    </section>
  );
}
