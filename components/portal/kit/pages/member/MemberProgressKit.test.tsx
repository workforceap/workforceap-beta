import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { MemberProgressKit, type MemberProgressKitProps } from './MemberProgressKit';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard/readiness',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const NUMBERS: MemberProgressKitProps = {
  coursePercent: 78,
  activeJobs: 4,
  certs: 2,
  points: 1240,
  pointsThisWeek: 85,
  currentStreak: 12,
  longestStreak: 20,
  pointsLedger: [
    { label: 'Module complete', amount: 40, color: 'accent' },
    { label: 'Application sent', amount: 25, color: 'info' },
  ],
};

function renderKit(props: MemberProgressKitProps = {}, locale: 'en' | 'es' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : es}>
      <MemberProgressKit {...props} />
    </NextIntlClientProvider>,
  );
}

describe('MemberProgressKit numbers page', () => {
  it('renders no numbers strip and no Points card when the route passes none, but links to the points page', () => {
    renderKit({ readinessScore: 40 });
    expect(screen.queryByTestId('progress-numbers')).toBeNull();
    expect(screen.queryByTestId('progress-points')).toBeNull();
    // The live readiness route passes no points data; the signed-in points
    // page (ledger + streak) must stay reachable from here, not go dark.
    const card = screen.getByTestId('progress-points-link');
    expect(within(card).getByRole('heading', { level: 2, name: 'Points and streak' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Open points/ })).toHaveAttribute('href', '/dashboard/points');
  });

  it('hides the points link card when pointsHref is null (fixtures) or when the Points card renders', () => {
    renderKit({ readinessScore: 40, pointsHref: null });
    expect(screen.queryByTestId('progress-points-link')).toBeNull();
    cleanup();
    renderKit({ readinessScore: 40, ...NUMBERS });
    expect(screen.getByTestId('progress-points')).toBeInTheDocument();
    expect(screen.queryByTestId('progress-points-link')).toBeNull();
  });

  it('shows the four tiles Home dropped, with the points delta only when there is one', () => {
    renderKit({ readinessScore: 40, ...NUMBERS });
    const strip = screen.getByTestId('progress-numbers');
    for (const [label, value] of [['Course', '78%'], ['Active applications', '4'], ['Certificates', '2'], ['Points', '1,240']]) {
      const labelEl = within(strip).getByText(label);
      expect(labelEl.parentElement).toHaveTextContent(value);
    }
    expect(within(strip).getByText('85 this week')).toBeInTheDocument();
  });

  it('leaves out a tile whose count the route did not pass', () => {
    renderKit({ readinessScore: 40, points: 90 });
    const strip = screen.getByTestId('progress-numbers');
    expect(within(strip).getByText('Points')).toBeInTheDocument();
    expect(within(strip).queryByText('Course')).toBeNull();
    expect(within(strip).queryByText('Certificates')).toBeNull();
    expect(within(strip).queryByText(/this week/)).toBeNull();
  });

  it('puts the streak and the recent-points ledger in a Points card that links to the points page', () => {
    renderKit({ readinessScore: 40, ...NUMBERS });
    const card = screen.getByTestId('progress-points');
    expect(within(card).getByRole('heading', { level: 2, name: 'Points' })).toBeInTheDocument();
    expect(card).toHaveTextContent('12');
    expect(card).toHaveTextContent('day streak');
    expect(card).toHaveTextContent('Best 20');
    const rows = within(card).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Module complete');
    expect(rows[0]).toHaveTextContent('+40');
    expect(within(card).getByRole('link', { name: /Points and levels/ })).toHaveAttribute('href', '/dashboard/points');
  });

  it('hides the streak at zero, the ledger when empty and the link when pointsHref is null', () => {
    renderKit({ readinessScore: 40, points: 300, currentStreak: 0, pointsLedger: [], pointsHref: null });
    const card = screen.getByTestId('progress-points');
    expect(card).not.toHaveTextContent('day streak');
    expect(within(card).queryByRole('list')).toBeNull();
    expect(within(card).queryByRole('link')).toBeNull();
  });

  it('keeps the numbers visible when the readiness score failed to load', () => {
    renderKit({ loadFailed: true, ...NUMBERS });
    expect(screen.getByText("Couldn't load your readiness score")).toBeInTheDocument();
    expect(screen.getByTestId('progress-numbers')).toBeInTheDocument();
    expect(screen.getByTestId('progress-points')).toBeInTheDocument();
  });

  it('opens with one h1 and one short context line, the rest behind a native disclosure', () => {
    const { container } = renderKit({ readinessScore: 40 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My progress');
    expect(screen.getByText(en.memberWorkspace.training.learningContextShort)).toBeInTheDocument();
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details!.querySelector('summary')).toHaveTextContent(en.memberWorkspace.training.learningContextMoreLabel);
    expect(details).toHaveTextContent(en.memberWorkspace.training.learningContextMore);
  });

  it('renders the Points card in Spanish without raw message keys', () => {
    const { container } = renderKit({ readinessScore: 40, ...NUMBERS }, 'es');
    expect(container.textContent).not.toMatch(/progress\.|memberWorkspace\./);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mi progreso');
    expect(screen.getByTestId('progress-points')).toHaveTextContent('85 esta semana');
  });
});
