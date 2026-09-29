import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ApplyResultsClient from '@/app/apply/results/ApplyResultsClient';
import { APPLY_STORAGE_KEY } from '@/lib/apply/applyBrowserState';

// WAP-271: on a phone the absolutely positioned "1st choice" label sat on top
// of the program icon. It now lays out in the card's first row, beside the icon.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en', localizeHref: (href: string) => `/en${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({
    firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100',
    q1: 'yes', q2: 'no', q3: 'yes', primaryBarriers: ['seeking_skills_training'], qualifies: true,
  }));
});
afterEach(cleanup);

describe('apply results rank label', () => {
  it('sits in the card flow next to the program icon, not on top of it', async () => {
    render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><ApplyResultsClient /></NextIntlClientProvider>);
    await screen.findByRole('button', { name: en.apply.resultsContinueAccount });
    const card = screen.getAllByRole('button').find((node) => node.classList.contains('apply-results-program-card'))!;
    fireEvent.click(card);

    const rank = within(card).getByText(en.apply.resultsRankFirst);
    expect(card).toContainElement(rank);
    expect(rank.style.position).not.toBe('absolute');
    // Same flex group as the icon, so the two share a row instead of overlapping.
    expect(rank.parentElement!.children.length).toBeGreaterThan(1);
    expect(rank.parentElement!.style.display).toBe('flex');
  });
});
