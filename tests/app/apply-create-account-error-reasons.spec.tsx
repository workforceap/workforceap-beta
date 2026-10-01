import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import es from '@/messages/es.json';
import ApplyCreateAccountForm from '@/app/apply/create-account/ApplyCreateAccountForm';
import { APPLY_STORAGE_KEY, saveSelectedPrograms } from '@/lib/apply/applyBrowserState';
import { PROGRAMS } from '@/lib/content/programs';

/**
 * WAP-242 item 3: signup errors carry a stable `reason`, so an applicant on
 * /es sees Spanish copy on the right field instead of the route's English
 * text, and the field is picked by code rather than by English substrings.
 */
const mocks = vi.hoisted(() => ({ track: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => mocks.params }));
vi.mock('@/lib/i18n/client', () => ({ useLocaleFromPath: () => 'es', localizeHref: (href: string) => `/es${href}` }));
vi.mock('@/components/LocalizedLink', () => ({ default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackApplyFunnel: mocks.track }));
vi.mock('@/lib/analytics/conversionValue', () => ({ trackConversionWithValue: vi.fn() }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

const START_HREF = 'http://localhost/es/apply/create-account';
const APPLICANT_EMAIL = 'example@example.org';
const originalLocation = window.location;
const wrap = (children: ReactNode) => <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">{children}</NextIntlClientProvider>;
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

const fieldError = (id: string) => document.getElementById(`${id}-error`)?.textContent;

describe('create-account server errors are localised by reason code', () => {
  it('a 409 for an existing account shows the Spanish text on the email field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      code: 'ACCOUNT_RECOVERY_REQUIRED',
      reason: 'account_recovery_required',
      error: 'An account with this email already exists. If you cannot sign in, contact WorkforceAP at (512) 777-1808 for staff-assisted account recovery.',
    }, 409));
    renderAndSubmit();
    await waitFor(() => expect(fieldError('email')).toBe(es.apply.errAccountRecovery));
    expect(document.getElementById('email')).toHaveAttribute('aria-invalid', 'true');
    expect(document.body.textContent).not.toContain('An account with this email already exists');
    expect(mocks.track).toHaveBeenCalledWith(3, 'account_create_error', expect.objectContaining({ error_message: 'account_recovery_required' }));
  });

  it('an invalid-field error is routed by its field, not by the English wording', async () => {
    // The English message names no field at all; only `field` says where it belongs.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ reason: 'invalid_field', field: 'phone', error: 'Too short.' }, 400));
    renderAndSubmit();
    await waitFor(() => expect(fieldError('phone')).toBe(es.apply.errPhoneDigits));
    expect(document.body.textContent).not.toContain('Too short.');
  });

  it('a reason with no field shows only the summary, in Spanish', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ reason: 'rate_limited', error: 'Too many signup attempts for this email. Please try again later.' }, 429));
    renderAndSubmit();
    await screen.findByText(es.apply.errRateLimited);
    expect(fieldError('email')).toBeUndefined();
    expect(document.body.textContent).not.toContain('Too many signup attempts for this email');
  });

  it('a response without a reason still falls back to the server text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Something unusual happened.' }, 500));
    renderAndSubmit();
    await screen.findByText('Something unusual happened.');
  });
});
