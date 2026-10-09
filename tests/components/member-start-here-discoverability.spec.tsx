import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import MemberPortalTopNav from '@/components/portal/MemberPortalTopNav';
import MemberStartHereCard from '@/components/portal/kit/pages/member/MemberStartHereCard';

/**
 * Ops (10/8/26): members were not finding the WIOA Preassessment or the AI
 * Career Tools. Both must be reachable from the top of the member home and in
 * the first phone tabs, without digging through menus.
 */

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe('member "Start here" shortcuts', () => {
  it('links the WIOA preassessment and AI Career Tools', () => {
    render(<MemberStartHereCard preassessmentCompleted={false} />);
    const card = within(screen.getByTestId('member-start-here'));
    expect(card.getByRole('heading', { name: 'Start here' })).toBeTruthy();
    const pre = card.getByRole('link', { name: /WIOA Preassessment/ });
    expect(pre.getAttribute('href')).toBe('/dashboard/assessment');
    expect(pre.textContent).toMatch(/35 questions/);
    expect(card.getByRole('link', { name: /AI Career Tools/ }).getAttribute('href')).toBe('/dashboard/ai-tools');
  });

  it('marks the preassessment done once taken instead of nagging', () => {
    render(<MemberStartHereCard preassessmentCompleted />);
    const pre = within(screen.getByTestId('member-start-here')).getByRole('link', { name: /WIOA Preassessment/ });
    expect(pre.textContent).toMatch(/Done/);
    expect(pre.getAttribute('data-done')).toBe('true');
  });
});

describe('member phone nav', () => {
  it('shows AI Career Tools and the WIOA preassessment within the first four tabs', () => {
    nav.pathname = '/dashboard';
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="America/Chicago">
        <MemberPortalTopNav />
      </NextIntlClientProvider>,
    );
    const links = within(screen.getByRole('navigation', { name: 'Member portal' })).getAllByRole('link');
    const firstFour = links.slice(0, 4).map((link) => link.getAttribute('href'));
    expect(firstFour).toContain('/dashboard/ai-tools');
    expect(firstFour).toContain('/dashboard/assessment');
    expect(links.map((l) => l.textContent?.trim())).toContain('WIOA Preassessment');
  });
});
