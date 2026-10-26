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

describe('MemberDoThisNextCard row variant (member home "This week")', () => {
  function showRow(overrides: Partial<typeof action> = {}, rowState: 'current' | 'todo' = 'current') {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ol>
          <MemberDoThisNextCard action={{ ...action, ...overrides }} variant="row" rowState={rowState} />
        </ol>
      </NextIntlClientProvider>,
    );
  }

  it('renders one task row: title, one subline and the CTA as the row action', () => {
    showRow();
    const row = screen.getByTestId('member-today-row');
    expect(row.tagName).toBe('LI');
    expect(row).toHaveAttribute('data-state', 'current');
    expect(row.querySelector('.wa-kit-task-row__title')?.textContent).toBe('Resume your training');
    expect(row.querySelector('.wa-kit-task-row__sub')?.textContent).toBe('Pick up where you left off.');
    const cta = screen.getByRole('link', { name: /Resume training/ });
    expect(cta.getAttribute('href')).toBe('/dashboard/program?program=google-it-support');
    expect(row.contains(cta)).toBe(true);
    // No standalone card, no eyebrow, no heading of its own.
    expect(row.querySelector('h2')).toBeNull();
    expect(row.querySelector('details')).toBeNull();
  });

  it('takes the todo state when it is not the first row', () => {
    showRow({}, 'todo');
    expect(screen.getByTestId('member-today-row')).toHaveAttribute('data-state', 'todo');
  });

  it('keeps the due date visible and moves only the explanation under "What happens next"', () => {
    const body = 'Module 8 of 9 is due Thursday. Finishing it keeps your certificate path on schedule and unlocks the next module.';
    showRow({ body });
    const row = screen.getByTestId('member-today-row');
    expect(row.querySelector('.wa-kit-task-row__sub')?.textContent).toBe('Module 8 of 9 is due Thursday.');
    expect(row.querySelector('details')?.textContent).toContain('Finishing it keeps your certificate path on schedule');
  });

  it('renders nothing without an action', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ol>
          <MemberDoThisNextCard action={null} variant="row" />
        </ol>
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('li')).toBeNull();
  });
});
