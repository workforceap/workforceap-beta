import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ApplyCreateAccountForm from '@/app/apply/create-account/ApplyCreateAccountForm';
import { APPLY_STORAGE_KEY, saveSelectedPrograms } from '@/lib/apply/applyBrowserState';
import { PROGRAMS } from '@/lib/content/programs';

/**
 * M07: when /api/apply/signup succeeds without a session (Supabase "Confirm
 * email" on), the applicant must see the existing "Check your email" screen
 * with their address instead of being sent to /apply/confirmation, which
 * implies they can already sign in. A non-JSON 5xx (an HTML 502/504 from the
 * edge) is an account error, not a "check your internet connection" error.
 */
const mocks = vi.hoisted(() => ({ track: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => mocks.params }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'en', localizeHref: (href: string) => `/en${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: mocks.track }));
vi.mock('@/lib/analytics/conversionValue', () => ({ trackConversionWithValue: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const START_HREF = 'http://localhost/en/apply/create-account';
const APPLICANT_EMAIL = 'example@example.org';
const originalLocation = window.location;
const wrap = (children: ReactNode) => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{children}</NextIntlClientProvider>;
const eligibility = { version: 1, updatedAt: new Date().toISOString(), firstName: 'Example', lastName: 'Applicant', email: APPLICANT_EMAIL, phone: '5125550100', q1: 'yes', q2: 'no', q3: 'yes', receivingUnemployment: 'no', exhaustedUnemployment: 'no', snapWic: 'no', ageGroup: '25_50', city: 'Austin', state: 'TX', zip: '78701', county: 'Travis', primaryBarriers: ['seeking_skills_training'], hearAbout: 'Google', qualifies: true };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderAndSubmit() {
  const { container } = render(wrap(<ApplyCreateAccountForm />));
  fireEvent.change(document.getElementById('password')!, { target: { value: 'FixturePassword123!' } });
  fireEvent.change(document.getElementById('confirmPassword')!, { target: { value: 'FixturePassword123!' } });
  fireEvent.click(document.getElementById('contactConsent')!);
  fireEvent.submit(container.querySelector('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(APPLY_STORAGE_KEY, JSON.stringify(eligibility));
  expect(saveSelectedPrograms([PROGRAMS[0].slug])).toBe(true);
  Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, href: START_HREF } });
  // jsdom does not implement scrollIntoView; the error summary calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('create-account result screens', () => {
  it('shows "Check your email" with the submitted address when signup returns no session, and does not navigate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, message: 'Please verify your email, then log in to view your dashboard and next steps.', redirectTo: '/login' }),
    );
    renderAndSubmit();
    const heading = await screen.findByRole('heading', { name: en.apply.accountVerifyTitle });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(APPLICANT_EMAIL)).toBeVisible();
    expect(screen.getByRole('link', { name: en.apply.accountVerifyLogin })).toHaveAttribute('href', '/login');
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(window.location.href).toBe(START_HREF);
  });

  it('navigates to /apply/confirmation when signup returns a session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ success: true, redirectTo: '/apply/confirmation' }));
    renderAndSubmit();
    await waitFor(() => expect(window.location.href).toBe('/apply/confirmation'));
    expect(screen.queryByRole('heading', { name: en.apply.accountVerifyTitle })).toBeNull();
  });

  // WAP-240: signup already sent the receipt; the confirmation page retries it
  // only when the server says that send failed.
  it('asks the confirmation page to retry the receipt only when signup reports it was not sent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, redirectTo: '/apply/confirmation', receiptSent: false }),
    );
    renderAndSubmit();
    await waitFor(() => expect(window.location.href).toBe('/apply/confirmation?receipt=0'));
  });

  it('adds no retry flag when signup sent the receipt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, redirectTo: '/apply/confirmation', receiptSent: true }),
    );
    renderAndSubmit();
    await waitFor(() => expect(window.location.href).toBe('/apply/confirmation'));
  });

  it('shows the generic account error, not the network error, for an HTML 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    );
    renderAndSubmit();
    await waitFor(() => expect(screen.getAllByRole('alert').map((node) => node.textContent)).toContain(en.apply.errAccountGeneric));
    expect(screen.queryByText(en.apply.errNetwork)).toBeNull();
    expect(window.location.href).toBe(START_HREF);
  });
});
