'use client';

import { Suspense, useCallback, useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import ApplyEligibilityClient from './ApplyEligibilityClient';
import ApplyPageSkeleton from './ApplyPageSkeleton';
import ApplyRefCapture from '@/components/apply/ApplyRefCapture';
import UtmCapture from '@/components/marketing/UtmCapture';
import { trackPaidApplyVariantRendered } from '@/lib/analytics/events';
import {
  UTM_SOURCE_COOKIE,
  UTM_SOURCE_COOKIE_MAX_AGE,
  type PaidApplyUtmSource,
} from '@/lib/apply/paidApplyUtm';
import { useApplyStickyCtaVisibility } from '@/lib/apply/useApplyStickyCtaVisibility';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import PreLaunchTag from '@/components/portal/PreLaunchTag';

const PAID_APPLY_ELIGIBILITY_ID = 'paid-apply-eligibility';

type PaidApplyVariantProps = {
  utmSource: PaidApplyUtmSource;
  program?: string;
  stepNav?: ReactNode;
  mobileTrustBar?: ReactNode;
  proofBlock?: ReactNode;
  trustStrip?: ReactNode;
};

export default function PaidApplyVariant({ utmSource, stepNav, mobileTrustBar, proofBlock, trustStrip }: PaidApplyVariantProps) {
  const t = useTranslations('apply');
  const showStickyCta = useApplyStickyCtaVisibility(`#${PAID_APPLY_ELIGIBILITY_ID}`);

  useEffect(() => {
    document.cookie = `${UTM_SOURCE_COOKIE}=${encodeURIComponent(utmSource)};path=/;max-age=${UTM_SOURCE_COOKIE_MAX_AGE};SameSite=Lax`;
    trackPaidApplyVariantRendered(utmSource);
  }, [utmSource]);

  const scrollToEligibility = useCallback(() => {
    document.getElementById(PAID_APPLY_ELIGIBILITY_ID)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }, []);

  return (
    <div className="paid-apply-landing">
      <section className="paid-apply-hero" aria-labelledby="paid-apply-hero-heading">
        <h1 id="paid-apply-hero-heading" className="paid-apply-hero__heading">
          {t('paidHeroHeading')}
        </h1>
        <p className="paid-apply-hero__subhead">
          {t('paidHeroSubhead')}
        </p>
        <p className="paid-apply-hero__help-compact">
          {t('questionsCall')}{' '}
          <a href="tel:+15127771808" className="paid-apply-hero__help-compact__link">
            (512) 777-1808
          </a>
        </p>
        <button
          type="button"
          className={marketingButtonPresets.heroPrimary('paid-apply-hero__cta')}
          onClick={scrollToEligibility}
        >
          {t('paidHeroCta')}
        </button>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <PreLaunchTag compact />
        </div>
      </section>

      <section
        id={PAID_APPLY_ELIGIBILITY_ID}
        className="paid-apply-form-section"
        aria-label={t('ariaEligibilityForm')}
      >
        <Suspense fallback={<ApplyPageSkeleton />}>
          <ApplyRefCapture />
          <UtmCapture />
        </Suspense>
        {mobileTrustBar}
        {stepNav}
        <p className="paid-apply-form-kicker" role="note">
          {t('paidFormKicker')}
        </p>
        {proofBlock}
        {trustStrip}
        <Suspense fallback={<ApplyPageSkeleton />}>
          <ApplyEligibilityClient variant="paid" />
        </Suspense>
      </section>

      {showStickyCta ? (
        <div className="paid-apply-sticky-cta" role="region" aria-label={t('ariaQuickAction')}>
          <button
            type="button"
            className={marketingButtonPresets.heroPrimary('paid-apply-sticky-cta__button')}
            onClick={scrollToEligibility}
          >
            {t('paidHeroCta')}
          </button>
        </div>
      ) : null}

      <style>{`
        .paid-apply-landing {
          font-family: var(--font-family);
          background: var(--surface-container-lowest);
          min-height: 100vh;
          padding-bottom: calc(var(--space-8) + 4.5rem + env(safe-area-inset-bottom, 0px));
        }

        .paid-apply-hero {
          padding: calc(var(--nav-height-default, 80px) + var(--space-8)) var(--space-6) var(--space-8);
          text-align: center;
          background: linear-gradient(
            165deg,
            var(--color-primary) 0%,
            color-mix(in srgb, var(--color-accent-dark) 72%, black) 55%,
            var(--color-accent-dark) 100%
          );
          color: var(--color-white);
        }

        .paid-apply-hero__heading {
          font-size: clamp(2rem, 6vw, 3rem);
          font-weight: 800;
          letter-spacing: 0;
          line-height: 1.1;
          max-width: 720px;
          margin: 0 auto var(--space-4);
        }

        .paid-apply-hero__subhead {
          max-width: 560px;
          margin: 0 auto var(--space-6);
          font-size: clamp(0.9375rem, 2.5vw, 1.05rem);
          line-height: var(--line-height-normal);
          color: color-mix(in srgb, var(--color-on-accent) 88%, transparent);
        }

        .paid-apply-hero__help-compact {
          display: none;
        }

        .paid-apply-hero__help-compact__link {
          color: var(--color-on-accent);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .paid-apply-hero__cta {
          min-width: min(100%, 320px);
        }

        .paid-apply-form-section {
          display: flex;
          flex-direction: column;
          max-width: 640px;
          margin: 0 auto;
          padding: var(--space-8) var(--space-6) var(--space-12);
        }

        .paid-apply-form-kicker {
          display: none;
          margin: 0 0 var(--space-3);
          padding: 0;
          border: none;
          background: transparent;
          font-size: var(--font-size-xs, 0.75rem);
          font-weight: 500;
          letter-spacing: 0;
          text-transform: none;
          color: var(--color-on-surface-variant);
          line-height: var(--line-height-normal);
          text-align: center;
        }

        .paid-apply-sticky-cta {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
          background: color-mix(in srgb, var(--surface-container-lowest) 96%, transparent);
          border-top: 1px solid var(--outline-variant);
          box-shadow: 0 -8px 24px color-mix(in srgb, var(--color-on-surface) 8%, transparent);
          backdrop-filter: blur(8px);
        }

        .paid-apply-sticky-cta__button {
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
          display: flex;
        }

        .apply-flow--paid .apply-step1-actions__primary {
          width: 100%;
        }

        .apply-flow--paid .apply-personal-grid {
          grid-template-columns: 1fr;
        }

        .paid-apply-proof {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }

        .paid-apply-proof__card {
          padding: var(--space-5);
          border-radius: var(--radius-lg);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container);
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
        }

        .paid-apply-proof__badge-icon {
          width: 1.5rem;
          height: 1.5rem;
          color: var(--color-green);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .paid-apply-proof__title {
          margin: 0 0 var(--space-2);
          font-size: var(--font-size-sm);
          font-weight: 700;
          color: var(--color-on-surface);
        }

        .paid-apply-proof__body {
          margin: 0 0 var(--space-4);
          font-size: var(--font-size-sm);
          line-height: var(--line-height-normal);
          color: var(--color-on-surface-variant);
        }

        .paid-apply-proof__actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
        }

        .paid-apply-proof__help-link {
          min-height: 44px;
        }

        @media (max-width: 768px) {
          .paid-apply-hero {
            padding: calc(var(--nav-height-default, 80px) + var(--space-5)) var(--space-4) var(--space-6);
          }

          .paid-apply-hero__help-compact {
            display: block;
            max-width: 560px;
            margin: 0 auto var(--space-4);
            font-size: var(--font-size-sm);
            line-height: var(--line-height-normal);
            color: color-mix(in srgb, var(--color-on-accent) 88%, transparent);
          }

          /* Form entry trust bar + kicker carry nonprofit/no-cost/time — drop hero repeat */
          .paid-apply-hero__subhead {
            display: none;
          }

          .paid-apply-form-section {
            padding: var(--space-6) var(--space-4) calc(var(--space-10) + 4.5rem + env(safe-area-inset-bottom, 0px));
          }

          .paid-apply-form-section .apply-mobile-trust-bar {
            order: 0;
          }

          .paid-apply-form-section .apply-mobile-step-nav {
            order: 1;
          }

          .paid-apply-form-kicker {
            display: block;
            order: 2;
          }

          /* Form first on mobile — proof card stays below the fold until after eligibility */
          .paid-apply-form-section .trust-strip--apply {
            order: 2;
            margin-bottom: var(--space-4);
          }

          .paid-apply-form-section .apply-flow--paid {
            order: 3;
          }

          .paid-apply-form-section .paid-apply-proof {
            order: 4;
            margin-top: var(--space-6);
            margin-bottom: 0;
          }

          .apply-flow--paid .apply-step1-actions {
            scroll-margin-bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
          }

          #paid-apply-eligibility {
            scroll-margin-top: calc(var(--nav-height-default, 80px) + var(--space-4));
          }
        }
      `}</style>
    </div>
  );
}
