import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  availability: {
    status: 'on' as const,
    info: { persona: 'counselor' as const, homeRoute: '/counselor/today', guideHref: '/counselor/guide', tourKey: 'counselor.home', starters: ['whereAmI'] },
  },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/counselor/today' }));
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...rest }: { children: ReactNode; href: string; prefetch?: boolean } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('@/components/onboarding/TourContext', () => ({ useTour: () => ({ start: mocks.start, isOpen: false }) }));
vi.mock('@/components/portal/help/useHelpAssistantAvailability', () => ({ useHelpAssistantAvailability: () => mocks.availability }));

import PortalHelpMenu from './PortalHelpMenu';

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PortalHelpMenu tourKey="counselor.home" guideHref="/counselor/guide" />
    </NextIntlClientProvider>,
  );
}

const menu = () => screen.queryByTestId('portal-help-panel');
const drawer = () => screen.queryByTestId('help-assistant-panel');

describe('PortalHelpMenu outside-click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes on a mousedown outside the menu and stays open on one inside it', () => {
    show();
    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    expect(menu()).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId('portal-help-take-tour'));
    expect(menu()).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  it('does not treat a mousedown inside the portaled Ask-for-help drawer as an outside click', () => {
    show();
    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    fireEvent.click(screen.getByTestId('portal-help-ask-assistant'));

    // Opening the drawer closes the menu; the drawer lives outside the menu's DOM subtree (portal).
    expect(menu()).toBeNull();
    const panel = drawer();
    expect(panel).not.toBeNull();
    expect(screen.getByTestId('portal-help-menu').contains(panel)).toBe(false);

    // Reopen the menu while the drawer is up, then press inside the drawer.
    fireEvent.click(screen.getByTestId('portal-help-trigger'));
    expect(menu()).not.toBeNull();
    fireEvent.mouseDown(screen.getByTestId('help-assistant-input'));
    expect(menu()).not.toBeNull();
    fireEvent.mouseDown(screen.getByTestId('help-assistant-starters'));
    expect(menu()).not.toBeNull();

    // A genuine outside press still closes the menu and leaves the drawer alone.
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
    expect(drawer()).not.toBeNull();
  });
});
