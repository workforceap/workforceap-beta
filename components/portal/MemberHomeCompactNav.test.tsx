import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberHomeCompactNav, { isMemberHomeCompactPath } from './MemberHomeCompactNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dev/member/home',
}));

describe('isMemberHomeCompactPath', () => {
  it('scopes the compact strip to the live home and the member-home proof only', () => {
    expect(isMemberHomeCompactPath('/dashboard')).toBe(true);
    expect(isMemberHomeCompactPath('/dev/member/home')).toBe(true);
    expect(isMemberHomeCompactPath('/dashboard/jobs')).toBe(false);
    expect(isMemberHomeCompactPath('/dashboard/program')).toBe(false);
    expect(isMemberHomeCompactPath('/dev/member/jobs')).toBe(false);
    expect(isMemberHomeCompactPath('/dev/member/home/extra')).toBe(false);
  });
});

describe('MemberHomeCompactNav', () => {
  it('renders the five permanent member destinations and remaps proof hrefs', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberHomeCompactNav
          hrefMap={{
            '/dashboard': '/dev/member/home',
            '/dashboard/program': '/dev/member/program',
            '/dashboard/jobs': '/dev/member/jobs',
            '/dashboard/ai-tools': '/dev/member/toolkit',
            '/dashboard/messages': '/dev/member/messages',
          }}
        />
      </NextIntlClientProvider>,
    );

    const nav = screen.getByRole('navigation', { name: messages.dashboard.home.compactNav });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/dev/member/home',
      '/dev/member/program',
      '/dev/member/jobs',
      '/dev/member/toolkit',
      '/dev/member/messages',
    ]);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(nav.querySelectorAll('[data-tour]')).toHaveLength(5);
  });
});
