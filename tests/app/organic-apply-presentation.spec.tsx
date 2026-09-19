import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import type { SchoolApplyContext } from '@/lib/apply/resolveSchoolApply';

const catalogs = { en, es, fr, pt };
const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'es' | 'fr' | 'pt', eligibility: vi.fn(), programIntro: vi.fn() }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => createTranslator({ locale: mocks.locale, messages: catalogs[mocks.locale], namespace: 'apply' }) }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => mocks.locale }));
vi.mock('@/components/Footer', () => ({ default: () => <footer>Footer fixture</footer> }));
vi.mock('@/app/apply/ApplyEligibilityClient', () => ({ default: (props: unknown) => { mocks.eligibility(props); return <div>Form fixture</div>; } }));
vi.mock('@/app/apply/ApplyPageSkeleton', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyProgramIntro', () => ({ default: (props: unknown) => { mocks.programIntro(props); return <div>Program fixture</div>; } }));
vi.mock('@/components/apply/ApplyRefCapture', () => ({ default: () => null }));
vi.mock('@/components/marketing/UtmCapture', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyMobileStepNav', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyMobileTrustBar', () => ({ default: () => null }));
vi.mock('@/components/apply/ApplyOrganicStickyCta', () => ({ default: () => null }));
vi.mock('@/components/marketing/TrustStrip', () => ({ default: () => null }));
vi.mock('@/lib/apply/applyProgramPage', () => ({ resolveApplyProgramSlug: (slug?: string) => slug, getProgramBySlug: (slug: string) => ({ slug }) }));

import OrganicApplyPage from '@/app/apply/OrganicApplyPage';

beforeEach(() => { vi.clearAllMocks(); mocks.locale = 'en'; });
afterEach(cleanup);

describe('organic apply presentation preserves the application path', () => {
  it.each(['en', 'es', 'fr', 'pt'] as const)('renders one hero start action, real form target, and secondary support in %s', async (locale) => {
    mocks.locale = locale;
    const { container } = render(await OrganicApplyPage({}));
    const hero = container.querySelector('.apply-hero') as HTMLElement;
    const t = catalogs[locale].apply;
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t.heroHeading);
    const start = within(hero).getByRole('link', { name: t.startYourApplication });
    expect(start).toHaveAttribute('href', '#apply-form-start');
    expect(document.getElementById('apply-form-start')).toContainElement(screen.getByText('Form fixture'));
    expect(within(hero).getByRole('link', { name: t.helpCta2 })).toHaveAttribute('href', 'tel:+15127771808');
    expect(within(hero).getByRole('link', { name: t.helpCta1 })).toHaveAttribute('href', `/${locale}/contact`);
    expect(mocks.eligibility).toHaveBeenCalledWith({ schoolApply: null });
    expect(mocks.programIntro).not.toHaveBeenCalled();
  });

  it('keeps school context and selected program attached to the form and intro', async () => {
    const schoolApply: SchoolApplyContext = { partnerId: 'fixture-school', partnerName: 'Fixture School', schoolName: 'Fixture School', referralCode: 'fixture-ref', programSlugs: ['fixture-program'] };
    render(await OrganicApplyPage({ program: 'fixture-program', schoolApply }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.apply.schoolHeroHeading);
    expect(mocks.eligibility).toHaveBeenCalledWith({ schoolApply });
    expect(mocks.programIntro).toHaveBeenCalledWith({ programSlug: 'fixture-program', schoolName: 'Fixture School', schoolRef: 'fixture-ref' });
  });
});

describe('hero contrast across every gradient stop', () => {
  const css = readFileSync(path.resolve(__dirname, '../../css/marketing-depth.css'), 'utf8');
  const heroCss = readFileSync(path.resolve(__dirname, '../../app/apply/OrganicApplyPage.module.css'), 'utf8');
  const color = (name: string) => {
    const value = css.match(new RegExp(`--mdx-${name}:#([a-f0-9]{3,6});`))![1];
    const hex = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value;
    return hex.match(/../g)!.map((part) => parseInt(part, 16));
  };
  const mix = (a: number[], b: number[], weight: number) => a.map((value, index) => value * (1 - weight) + b[index] * weight);
  const luminance = (rgb: number[]) => rgb.map((value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  it('supports normal white text, large gold headings and the start button in both themes', () => {
    // Read the real palette/overlay opacity. Pure white is the conservative
    // upper bound for the translucent decorative photo over any gradient stop.
    expect(heroCss).not.toContain('--color-primary');
    const white = color('surface');
    const gold = css.match(/\.mdx-stage \.mdx-grad-accent\{background:linear-gradient\(100deg,#fff,#([a-f0-9]{6})\)/)![1].match(/../g)!.map((part) => parseInt(part, 16));
    const opacity = Number(heroCss.match(/\.hero::after\s*\{\s*opacity:\s*([.\d]+)/)![1]);
    const stops = ['crimson', 'accent-dark', 'plum'].map(color);
    for (let segment = 0; segment < stops.length - 1; segment++) {
      for (let step = 0; step <= 100; step++) {
        const background = mix(mix(stops[segment], stops[segment + 1], step / 100), white, opacity);
        expect(contrast(white, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(gold, background)).toBeGreaterThanOrEqual(3);
        // The hero's help card and label use 8% and 10% white surfaces.
        for (const surfaceAlpha of [0.08, 0.1]) expect(contrast(white, mix(background, white, surfaceAlpha))).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(color('accent-dark'), white)).toBeGreaterThanOrEqual(4.5);
  });
});
