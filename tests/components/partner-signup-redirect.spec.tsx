import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PartnerSignupRedirectPage from '@/app/partner-signup/page';

/**
 * WAP-118 unit lane. The route hands off to the Astro-owned /partners with a
 * document navigation (`window.location.replace`), not a router push, and
 * renders its fallback link in the first render. Both are independent of the
 * viewport, so the same assertion runs at the three widths the ticket named.
 * The browser-level check (final URL at 390/768/1280) lives in
 * tests/e2e/partner-signup-viewports.spec.ts and needs a running app.
 */
const replace = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  replace.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, replace, href: 'http://localhost/en/partner-signup' },
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('/partner-signup redirect page', () => {
  it.each([390, 768, 1280])('at %ipx wide, replaces the document with /partners#partner-signup and shows the fallback link', (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
    render(<PartnerSignupRedirectPage />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/partners#partner-signup');
    expect(screen.getByRole('link', { name: 'Continue to partner sign-up' })).toHaveAttribute('href', '/partners#partner-signup');
  });
});
