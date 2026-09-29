import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';
import ApplyEligibilityClient from '@/app/apply/ApplyEligibilityClient';
import { APPLY_FLOW_DRAFT_KEY } from '@/lib/apply/applyProgramStorage';
import { PRIMARY_BARRIER_OPTIONS } from '@/lib/apply/primaryBarrierOptions';
import { SCHOOL_AGE_GROUPS, SCHOOL_GRADE_LEVELS } from '@/lib/apply/schoolCollection';

// WAP-242 item 2: the barrier, age-group and grade-level choices on /apply
// were hard-coded English, so /es, /fr and /pt showed English labels. They
// now come from the locale catalog; the stored values are unchanged.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'es', localizeHref: (href: string) => `/es${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: vi.fn() }));
vi.mock('@/lib/analytics/conversionValue', () => ({ trackConversionWithValue: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const wrap = (children: ReactNode) => <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">{children}</NextIntlClientProvider>;
const draft = { version: 1, updatedAt: new Date().toISOString(), firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100', q1: 'yes', q2: 'no', q3: 'yes', receivingUnemployment: 'no', exhaustedUnemployment: 'no', snapWic: 'no', ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', primaryBarriers: ['seeking_skills_training'], hearAbout: 'Google', panel: 'background' };
const savedBarriers = () => JSON.parse(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)!).primaryBarriers as string[];

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem(APPLY_FLOW_DRAFT_KEY, JSON.stringify(draft)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('apply eligibility option labels (WAP-242 item 2)', () => {
  it('shows Spanish barrier and age labels on /es, and no English ones', () => {
    const { container } = render(wrap(<ApplyEligibilityClient />));
    for (const option of PRIMARY_BARRIER_OPTIONS) {
      expect(screen.getByRole('checkbox', { name: es.apply.barrierOptions[option.value] })).toBeInTheDocument();
      if (option.label !== es.apply.barrierOptions[option.value]) {
        expect(container.textContent).not.toContain(option.label);
      }
    }
    expect(screen.getByRole('option', { name: es.apply.ageGroupOptions.under_18 })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Under 18' })).toBeNull();
  });

  it('still stores the same barrier value when a translated box is ticked', () => {
    render(wrap(<ApplyEligibilityClient />));
    fireEvent.click(screen.getByRole('checkbox', { name: es.apply.barrierOptions.employment_gap }));
    fireEvent.click(screen.getByRole('button', { name: es.apply.saveContinueLater }));
    expect(savedBarriers()).toEqual(['seeking_skills_training', 'employment_gap']);
  });

  it('every choice has a label in all four catalogs', () => {
    const ageValues = ['under_18', '18_24', '25_50', '50_plus', ...SCHOOL_AGE_GROUPS.map((o) => o.value)];
    for (const catalog of [en, es, fr, pt]) {
      for (const option of PRIMARY_BARRIER_OPTIONS) expect(catalog.apply.barrierOptions[option.value]).toEqual(expect.any(String));
      for (const value of ageValues) expect(catalog.apply.ageGroupOptions[value as keyof typeof en.apply.ageGroupOptions]).toEqual(expect.any(String));
      for (const option of SCHOOL_GRADE_LEVELS) expect(catalog.apply.gradeLevelOptions[option.value]).toEqual(expect.any(String));
    }
  });
});
