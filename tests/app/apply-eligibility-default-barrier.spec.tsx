import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ApplyEligibilityClient from '@/app/apply/ApplyEligibilityClient';
import { APPLY_FLOW_DRAFT_KEY } from '@/lib/apply/applyProgramStorage';
import { DEFAULT_PRIMARY_BARRIER, PRIMARY_BARRIER_OPTIONS } from '@/lib/apply/primaryBarrierOptions';

// WAP-242 item 1: the always-included default barrier used to refuse a click
// silently (it unchecked and snapped straight back). It is now shown as a
// fixed, checked choice; every other barrier still toggles.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en', localizeHref: (href: string) => `/en${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: vi.fn() }));
vi.mock('@/lib/analytics/conversionValue', () => ({ trackConversionWithValue: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const wrap = (children: ReactNode) => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider>;
const draft = { version: 1, updatedAt: new Date().toISOString(), firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100', q1: 'yes', q2: 'no', q3: 'yes', receivingUnemployment: 'no', exhaustedUnemployment: 'no', snapWic: 'no', ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', primaryBarriers: ['seeking_skills_training'], hearAbout: 'Google', panel: 'background' };
const labelFor = (value: string) => PRIMARY_BARRIER_OPTIONS.find((option) => option.value === value)!.label;
const savedBarriers = () => JSON.parse(localStorage.getItem(APPLY_FLOW_DRAFT_KEY)!).primaryBarriers as string[];

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem(APPLY_FLOW_DRAFT_KEY, JSON.stringify(draft)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('apply eligibility: default barrier', () => {
  it('shows the default barrier as a fixed checked choice that a click does not change', () => {
    render(wrap(<ApplyEligibilityClient />));
    const fixed = screen.getByRole('checkbox', { name: labelFor(DEFAULT_PRIMARY_BARRIER.value) });
    expect(fixed).toBeChecked();
    expect(fixed).toBeDisabled();
    fireEvent.click(fixed);
    expect(fixed).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: en.apply.saveContinueLater }));
    expect(savedBarriers()).toContain(DEFAULT_PRIMARY_BARRIER.value);
  });

  it('every other barrier still toggles on and off, and the default stays in the draft', () => {
    render(wrap(<ApplyEligibilityClient />));
    const gap = screen.getByRole('checkbox', { name: labelFor('employment_gap') });
    expect(gap).toBeEnabled();
    expect(gap).not.toBeChecked();
    fireEvent.click(gap);
    expect(gap).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: en.apply.saveContinueLater }));
    expect(savedBarriers()).toEqual([DEFAULT_PRIMARY_BARRIER.value, 'employment_gap']);
    fireEvent.click(gap);
    expect(gap).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: en.apply.saveContinueLater }));
    expect(savedBarriers()).toEqual([DEFAULT_PRIMARY_BARRIER.value]);
    expect(screen.getByRole('checkbox', { name: labelFor(DEFAULT_PRIMARY_BARRIER.value) })).toBeChecked();
  });
});
