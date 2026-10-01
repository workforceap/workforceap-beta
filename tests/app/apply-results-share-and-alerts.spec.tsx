import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ApplyResultsClient from '@/app/apply/results/ApplyResultsClient';
import { APPLY_STORAGE_KEY } from '@/lib/apply/applyBrowserState';
import { getProgramBySlug } from '@/lib/content/programs';

// WAP-241: the results step must not announce an error before the applicant
// acts, must announce the three-pick limit, and its Share link must open a
// page the recipient can actually use.
const mocks = vi.hoisted(() => ({ track: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => mocks.params }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en', localizeHref: (href: string) => `/en${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: mocks.track }));

const wrap = (children: ReactNode) => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider>;
const saveEligibility = (qualifies = true) =>
  localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify({
    firstName: 'Example', lastName: 'Applicant', email: 'example@example.org', phone: '5125550100',
    q1: 'yes', q2: 'no', q3: 'yes', primaryBarriers: ['seeking_skills_training'], qualifies,
  }));
const cards = () => screen.getAllByRole('button').filter((node) => node.classList.contains('apply-results-program-card'));
const continueButton = () => screen.getByRole('button', { name: en.apply.resultsContinueAccount });

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); mocks.params = new URLSearchParams(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('apply results: errors only after the applicant acts', () => {
  it('announces nothing as an error on first render and keeps the hint as plain text', async () => {
    saveEligibility();
    render(wrap(<ApplyResultsClient />));
    await screen.findByRole('button', { name: en.apply.resultsContinueAccount });
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByText(en.apply.resultsSelectProgramError)).toBeVisible();
    expect(continueButton()).toBeEnabled();
  });

  it('Continue with nothing selected shows an announced error, tracks the block and focuses the first program', async () => {
    saveEligibility();
    render(wrap(<ApplyResultsClient />));
    await screen.findByRole('button', { name: en.apply.resultsContinueAccount });
    fireEvent.click(continueButton());
    expect(screen.getByRole('alert')).toHaveTextContent(en.apply.resultsSelectProgramError);
    expect(mocks.track).toHaveBeenCalledWith(2, 'program_continue_blocked');
    await waitFor(() => expect(document.activeElement).toBe(cards()[0]));
    expect(mocks.track).not.toHaveBeenCalledWith(2, 'program_selected', expect.anything());
  });
});

describe('apply results: the three-pick limit', () => {
  it.each([
    [true, en.apply.resultsHintQualifies],
    [false, en.apply.resultsHintNonQual],
  ])('a 4th pick is announced and the selection stays at three (qualifies=%s)', async (qualifies, limitText) => {
    saveEligibility(qualifies);
    render(wrap(<ApplyResultsClient />));
    await screen.findByRole('button', { name: en.apply.resultsContinueAccount });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
    const [a, b, c, d] = cards();
    for (const card of [a, b, c]) fireEvent.click(card);
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(d);
    expect(cards().filter((card) => card.getAttribute('aria-pressed') === 'true')).toHaveLength(3);
    expect(d).toHaveAttribute('aria-pressed', 'false');
    expect(status).toHaveTextContent(limitText);
    // Keyboard selection gets the same announcement.
    fireEvent.click(a);
    fireEvent.click(d);
    expect(status).toBeEmptyDOMElement();
    fireEvent.keyDown(a, { key: 'Enter' });
    expect(a).toHaveAttribute('aria-pressed', 'false');
    expect(status).toHaveTextContent(limitText);
  });
});

describe('apply results: Share link', () => {
  it('copies an /apply link whose program param is one slug the recipient can resolve', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    saveEligibility();
    render(wrap(<ApplyResultsClient />));
    await screen.findByRole('button', { name: en.apply.resultsContinueAccount });
    const [first, second] = cards();
    fireEvent.click(first);
    fireEvent.click(second);
    fireEvent.click(screen.getByRole('button', { name: en.apply.shareLink }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const shared = new URL(writeText.mock.calls[0][0] as string);
    expect(shared.origin).toBe(window.location.origin);
    expect(shared.pathname).toBe('/en/apply');
    const program = shared.searchParams.get('program');
    expect(program).not.toContain(',');
    expect(getProgramBySlug(program!)).toBeTruthy();
    expect(first).toHaveTextContent(getProgramBySlug(program!)!.title);
    expect(await screen.findByRole('button', { name: en.apply.shareLinkCopied })).toBeVisible();
  });
});
