import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MemberPortalTopNav from '@/components/portal/MemberPortalTopNav';
import { EARLY_TAP_GLOBAL, EARLY_TAP_SCRIPT } from '@/lib/portal/earlyShellTap';

/**
 * Round 2: the phone "More pages" disclosure closes on Escape and puts focus
 * back on its button, and a tap that lands before hydration is replayed.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>)[EARLY_TAP_GLOBAL];
  document.body.innerHTML = '';
});

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="America/Chicago">
      <MemberPortalTopNav />
    </NextIntlClientProvider>,
  );
}

const moreButton = () => screen.getByRole('button', { name: 'More pages' });

describe('MemberPortalTopNav More pages disclosure', () => {
  it('closes on Escape and returns focus to the More pages button', () => {
    show();
    fireEvent.click(moreButton());
    expect(moreButton()).toHaveAttribute('aria-expanded', 'true');

    const extraLink = screen.getByRole('link', { name: 'My certificates' });
    extraLink.focus();
    fireEvent.keyDown(extraLink, { key: 'Escape' });

    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(moreButton());
  });

  it('ignores Escape while closed and does not steal focus', () => {
    show();
    const home = screen.getByRole('link', { name: 'Home' });
    home.focus();
    fireEvent.keyDown(home, { key: 'Escape' });
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(home);
  });

  it('opens for a tap that landed before the nav mounted', () => {
    new Function(EARLY_TAP_SCRIPT)();
    const staticButton = document.createElement('button');
    staticButton.setAttribute('data-early-tap', 'more');
    document.body.appendChild(staticButton);
    staticButton.click();

    show();
    expect(moreButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks the button for early-tap capture', () => {
    show();
    expect(moreButton()).toHaveAttribute('data-early-tap', 'more');
  });
});
