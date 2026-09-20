'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import LocalizedLink from '@/components/LocalizedLink';
import {
  EXPERIMENTS,
  getExperimentVariant,
  readExperimentOverrideFromSearch,
} from '@/lib/experiments/client';
import {
  trackCtaExperimentClick,
  trackCtaExperimentExposure,
} from '@/lib/analytics/events';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';

type Props = {
  controlLabel: string;
  variantALabel: string;
  href: string;
  external?: boolean;
  onDark?: boolean;
  className?: string;
};

const EXPERIMENT = EXPERIMENTS.EMPLOYERS_HERO_CTA;
const SESSION_DEDUPE_PREFIX = 'wa_exp_seen:';

/**
 * Hero CTA wired to the `employers_hero_cta` A/B test.
 *
 * Variants:
 *   - control   → existing "Get Started" copy.
 *   - variant_a → hiring-ready talent consultation copy.
 *
 * Server-rendered fallback uses `control`. After hydration we resolve the
 * stable visitor variant via `getExperimentVariant` and swap the copy.
 */
export default function EmployersHeroCtaExperiment({
  controlLabel,
  variantALabel,
  href,
  external = false,
  onDark = false,
  className = '',
}: Props) {
  const pathname = usePathname() ?? '/employers';
  const searchParams = useSearchParams();
  const [variant, setVariant] = useState<'control' | 'variant_a'>('control');

  // Resolve client-side once mounted. Server renders `control` so the
  // initial paint is consistent (no hydration mismatch on the label).
  const override = useMemo(
    () => readExperimentOverrideFromSearch(searchParams ?? undefined),
    [searchParams],
  );

  useEffect(() => {
    const chosen = getExperimentVariant(EXPERIMENT, undefined, override);
    setVariant(chosen);

    const dedupeKey = `${SESSION_DEDUPE_PREFIX}${EXPERIMENT.name}:${chosen}:${pathname}`;
    let alreadyTracked = false;
    try {
      alreadyTracked = sessionStorage.getItem(dedupeKey) === '1';
      if (!alreadyTracked) sessionStorage.setItem(dedupeKey, '1');
    } catch {
      alreadyTracked = false;
    }
    if (!alreadyTracked) {
      trackCtaExperimentExposure(EXPERIMENT.name, chosen, pathname);
    }
  }, [override, pathname]);

  const label = variant === 'variant_a' ? variantALabel : controlLabel;
  const classes = [
    onDark ? marketingButtonPresets.heroPrimary() : marketingButtonPresets.formSubmitPrimary(),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="employers-hero-cta__label">{label}</span>
      {/* Forward cue (not a calendar booking cue): tests/api/employers-page.spec.ts */}
      <ArrowRight size={18} className="employers-hero-cta__icon" aria-hidden="true" />
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        className={classes}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackCtaExperimentClick(EXPERIMENT.name, variant, pathname, href)}
        data-experiment={EXPERIMENT.name}
        data-experiment-variant={variant}
      >
        {content}
      </a>
    );
  }

  return (
    <LocalizedLink
      href={href}
      className={classes}
      onClick={() => trackCtaExperimentClick(EXPERIMENT.name, variant, pathname, href)}
      data-experiment={EXPERIMENT.name}
      data-experiment-variant={variant}
    >
      {content}
    </LocalizedLink>
  );
}
