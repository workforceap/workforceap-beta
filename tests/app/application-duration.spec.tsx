import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import { useT } from '@/marketing/src/i18n/t';

const catalogs = { en, es, fr, pt };
const state = vi.hoisted(() => ({ locale: 'en' as keyof typeof catalogs }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => createTranslator({
    locale: state.locale, messages: catalogs[state.locale], namespace: 'apply',
  }),
}));
import ApplyMobileStepNav from '@/components/apply/ApplyMobileStepNav';

afterEach(cleanup);

describe('one approximate duration for the complete application', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('interpolates the same %s estimate in Next and Astro consumers', (locale) => {
    const next = createTranslator({ locale, messages: catalogs[locale] });
    const astro = useT(locale);
    const duration = next('apply.applicationTimeEstimate');
    expect(astro('apply.applicationTimeEstimate')).toBe(duration);
    const templates = [
      'apply.paidHeroSubhead', 'apply.resultsKicker', 'apply.createAccountFormKicker',
      'marketing.home.ctaCopy', 'marketing.home.heroStep1',
      'marketing.home.memberPromiseBody1', 'marketing.howItWorks.ctaBody',
    ] as const;
    for (const key of templates) {
      for (const translate of [next, astro]) {
        const copy = translate(key, { duration });
        expect(copy).toContain(duration);
        expect(copy).not.toContain('{duration}');
        // Changing the one value changes every consumer, rather than leaving a literal estimate.
        const changed = translate(key, { duration: 'ESTIMATE' });
        expect(changed).toContain('ESTIMATE');
        expect(changed).not.toMatch(/\b5\b|five|cinco|cinq/);
      }
    }
    const mirror = JSON.parse(readFileSync(`marketing/src/i18n/${locale}.json`, 'utf8'));
    expect(mirror.apply.applicationTimeEstimate).toBe(duration);
    if (locale === 'en') {
      const legacyMirror = JSON.parse(readFileSync('marketing/src/lib/messages.en.json', 'utf8'));
      expect(legacyMirror.apply.applicationTimeEstimate).toBe(duration);
    }
  });

  it.each(['en', 'es', 'fr', 'pt'] as const)('renders truthful active-step hints in %s without step-duration claims', async (locale) => {
    state.locale = locale;
    for (const school of [false, true]) {
      for (const activeStep of [0, 1, 2] as const) {
        const { container, unmount } = render(await ApplyMobileStepNav({ activeStep, showStepHint: true, school }));
        const summary = container.querySelector('.apply-mobile-step-nav__summary')!;
        const active = container.querySelector('[aria-current="step"]')!;
        const label = active.querySelector('.apply-mobile-step-nav__label')!.textContent!;
        expect(summary.textContent).toContain(label);
        expect(summary.textContent).toContain(String(activeStep + 1));
        expect(summary.textContent).not.toMatch(/min|\b5\b/);
        expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
        unmount();
      }
    }
  });

  it('preserves missing-key fallback and only substitutes supplied plain-text values', () => {
    expect(useT('unknown')('apply.applicationTimeEstimate')).toBe(en.apply.applicationTimeEstimate);
    expect(useT('fr')('missing.key')).toBe('missing.key');
    expect(useT('en')('marketing.home.heroStep1')).toContain('{duration}');
    expect(useT('en')('marketing.home.heroStep1', { duration: '$& <five>' })).toContain('$& <five>');
  });
});
