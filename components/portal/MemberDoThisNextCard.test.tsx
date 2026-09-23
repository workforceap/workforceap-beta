import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberDoThisNextCard from './MemberDoThisNextCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const action = {
  id: 'resume_training',
  title: 'Resume your training',
  body: 'Pick up where you left off.',
  href: '/dashboard/training?program=google-it-support',
  cta: 'Resume training',
  variant: 'urgent' as const,
  weight: 90,
};

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemberDoThisNextCard action={action} />
    </NextIntlClientProvider>,
  );
}

describe('MemberDoThisNextCard destination', () => {
  it('rewrites the dead training stub to My Program', () => {
    const { container, unmount } = show();
    const cta = screen.getByRole('link', { name: /Resume training/ });
    expect(cta.getAttribute('href')).toBe('/dashboard/program?program=google-it-support');
    expect(container.querySelector('a[href^="/dashboard/training"]')).toBeNull();
    unmount();
  });

  it('leaves real destinations alone', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberDoThisNextCard action={{ ...action, href: '/dashboard/assessment' }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: /Resume training/ }).getAttribute('href')).toBe('/dashboard/assessment');
  });
});
