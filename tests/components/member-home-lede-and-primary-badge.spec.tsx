import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import DashboardProgramSelector from '@/components/portal/DashboardProgramSelector';

/**
 * WAP-253 items 1 and 5 (phone QA round 3, 390x844).
 *
 * Item 1: the member home "Do this next" body line was clamped to two lines
 * with an ellipsis, so the due date at the end ("due Thursday.") was hidden.
 * Item 5: the program switcher's PRIMARY badge never wrapped, so it squeezed
 * a long program title into a narrow column.
 *
 * jsdom cannot measure layout, so these specs pin the inline styles that
 * produce the behaviour; phone QA re-measures the rendered result.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
}));

const BODY = '~25 min · Module 8 of 9 · AWS Cloud Practitioner — due Thursday.';

const action = {
  id: 'resume_training',
  title: 'Resume your training',
  body: BODY,
  href: '/dashboard/assessment',
  cta: 'Resume training',
  variant: 'urgent' as const,
  weight: 90,
};

describe('MemberDoThisNextCard body line (WAP-253 item 1)', () => {
  it('shows the whole body, due date included, with no line clamp or ellipsis', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberDoThisNextCard action={action} />
      </NextIntlClientProvider>,
    );
    const body = screen.getByText(BODY);
    expect(body.tagName).toBe('P');
    expect(body.textContent).toBe(BODY);
    expect(body.textContent).toMatch(/due Thursday\.$/);

    const style = body.getAttribute('style') ?? '';
    expect(style).not.toMatch(/line-clamp/i);
    expect(style).not.toMatch(/text-overflow:\s*ellipsis/i);
    expect(body.style.overflow).not.toBe('hidden');
    expect(body.style.display).not.toBe('-webkit-box');
    expect(body.style.margin).toBe('0px');
    expect(body.style.color).toContain('--wa-on-accent');
  });

  it('keeps the two-line clamp on the title', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberDoThisNextCard action={action} />
      </NextIntlClientProvider>,
    );
    const title = screen.getByRole('heading', { name: 'Resume your training' });
    const style = title.getAttribute('style') ?? '';
    expect(style).toMatch(/line-clamp:\s*2/i);
    expect(title.style.textOverflow).toBe('ellipsis');
  });
});

const options = [
  { id: 'e1', programSlug: 'it-support', programTitle: 'IT Support', isPrimary: false },
  {
    id: 'e2',
    programSlug: 'aws-cloud',
    programTitle: 'AWS Cloud Practitioner with a Very Long Program Name',
    isPrimary: true,
  },
];

describe('DashboardProgramSelector Primary badge (WAP-253 item 5)', () => {
  beforeEach(() => push.mockClear());

  function open() {
    render(<DashboardProgramSelector activeProgramSlug="it-support" options={options} />);
    fireEvent.click(screen.getByTestId('dashboard-program-selector'));
  }

  it('lets the badge wrap under a long title instead of squeezing it', () => {
    open();
    const option = screen.getByRole('button', { name: /Very Long Program Name/ });
    expect(option.style.flexWrap).toBe('wrap');
    expect(option.style.minHeight).toBe('44px');

    const title = screen.getByText('AWS Cloud Practitioner with a Very Long Program Name');
    expect(title.style.flex).toBe('1 1 10rem');

    const badge = screen.getByLabelText('Primary program');
    expect(badge).toHaveAttribute('title', 'Primary program');
    expect(option).toContainElement(badge);
  });

  it('still navigates when an option is clicked', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Very Long Program Name/ }));
    expect(push).toHaveBeenCalledWith('/dashboard?program=aws-cloud');
  });
});
