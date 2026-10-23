/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MemberDoThisNextCard from '@/components/portal/MemberDoThisNextCard';
import type { NextBestAction } from '@/lib/member/nextBestActions';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      todayFocus: 'Your next step',
      doThisNext: 'Do this next',
      alsoForYou: 'Also for you',
      alsoForYouHint: 'Other helpful next steps',
      recommendedNextStep: 'Recommended next step',
      yourNextStepsTitle: 'Your next steps',
      startHereBasedOnProgress: 'Start here based on your progress',
      pickedForYou: 'Picked for you based on your progress',
      dismissAction: 'Dismiss',
      startHere: 'Start here',
    };
    return map[key] ?? key;
  },
}));

vi.mock('@/lib/analytics/events', () => ({
  trackFunnelEvent: vi.fn(),
}));

vi.mock('@/lib/events/client', () => ({
  postMemberEvent: vi.fn(),
}));

const sampleAction: NextBestAction = {
  id: 'action-1',
  title: 'Continue your next course',
  body: 'Pick up where you left off in training.',
  href: '/dashboard/learning',
  cta: 'Open course',
  variant: 'default',
  weight: 10,
};

/** Persisted MemberNextBestAction rows carry a UUID id; synthetic ones do not. */
const persistedAction: NextBestAction = {
  ...sampleAction,
  id: '7f1c3a2e-5b6d-4c8f-9a0b-1d2e3f4a5b6c',
};

describe('MemberDoThisNextCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels the primary CTA as Your next step', () => {
    render(<MemberDoThisNextCard action={sampleAction} />);
    expect(screen.getByLabelText('Your next step')).toBeInTheDocument();
    expect(screen.getByText('Your next step')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open course' })).toHaveAttribute('href', '/dashboard/learning');
  });

  it('rewrites a stored /dashboard/training CTA onto My Program', () => {
    render(
      <MemberDoThisNextCard
        action={{ ...sampleAction, href: '/dashboard/training', cta: 'Resume module' }}
      />,
    );
    expect(screen.getByRole('link', { name: /Resume module/ })).toHaveAttribute(
      'href',
      '/dashboard/program',
    );
  });

  it('keeps the persisted action pending when its destination is opened', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemberDoThisNextCard action={persistedAction} />);
    const link = screen.getByRole('link', { name: /Open course/ });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Continue your next course')).toBeInTheDocument();
  });

  it('does not PATCH synthetic (non-UUID) actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemberDoThisNextCard action={sampleAction} />);
    fireEvent.click(screen.getByRole('link', { name: /Open course/ }));

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
