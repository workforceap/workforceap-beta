import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ReadinessProgressSummary } from '@/components/portal/ReadinessProgressSummary';
import { buildReadinessProgressView } from '@/lib/readiness/progressView';
import { SCREENSHOT_86_BREAKDOWN, zeroScoreBreakdown } from '@/lib/readiness/progressView.fixtures';
import {
  READINESS_SCORE_LOAD_ERROR,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
} from '@/lib/readiness/progressSummary';

const view = buildReadinessProgressView(SCREENSHOT_86_BREAKDOWN);

function renderCard(overrides: Partial<Parameters<typeof ReadinessProgressSummary>[0]> = {}) {
  return render(
    <ReadinessProgressSummary
      factualSummary={buildFactualReadinessRecap(view)}
      nextAction={view.priorityAction}
      breakdown={buildReadinessRecapBreakdown(view)}
      enableGeneration={false}
      {...overrides}
    />,
  );
}

describe('ReadinessProgressSummary (coach note)', () => {
  it('prints the breakdown from the score model: total, max, every area, lowest tagged', () => {
    renderCard();
    const breakdown = screen.getByTestId('readiness-recap-breakdown');
    expect(breakdown).toHaveTextContent('86 of 105 points');
    expect(breakdown).toHaveTextContent('score of 86');
    const rows = within(breakdown).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Resume & Profile 25/25 · 100%',
      'Training & Certs Lowest 21/35 · 60%',
      'Interview & Jobs 25/30 · 83%',
      'Engagement 15/15 · 100%',
    ]);
    expect(rows[1]).toHaveAttribute('data-lowest', 'true');
    expect(rows.filter((r) => r.hasAttribute('data-lowest'))).toHaveLength(1);
  });

  it('renders the note as paragraphs, never one blob', () => {
    renderCard();
    const text = screen.getByTestId('readiness-progress-summary-text');
    const paragraphs = text.querySelectorAll('p');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toHaveTextContent(/^Training & Certs is your lowest area/);
    expect(paragraphs[2]).toHaveTextContent('Next: Complete more pathway steps in your training program.');
  });

  it('primary CTA follows the weakest area and the coach link stays secondary', () => {
    renderCard();
    const primary = screen.getByRole('link', { name: /Continue training/ });
    expect(primary).toHaveAttribute('href', '/dashboard/program');
    expect(primary.className).toContain('wa-kit-cta');
    expect(primary.className).not.toContain('wa-kit-cta--ghost');
    const coach = screen.getByRole('link', { name: 'Open readiness coach' });
    expect(coach.className).toContain('wa-kit-cta--ghost');
    expect(screen.queryByRole('link', { name: /Apply to jobs/ })).toBeNull();
  });

  it('starts from the factual source tag when generation is off', () => {
    renderCard();
    expect(screen.getByText('From your numbers')).toBeInTheDocument();
  });

  it('empty member: zeros in the breakdown, honest zero note, resume CTA', () => {
    const empty = buildReadinessProgressView(zeroScoreBreakdown());
    renderCard({
      factualSummary: buildFactualReadinessRecap(empty),
      nextAction: empty.priorityAction,
      breakdown: buildReadinessRecapBreakdown(empty),
    });
    expect(screen.getByTestId('readiness-recap-breakdown')).toHaveTextContent('0 of 105 points');
    expect(screen.getByText(/No scored activity yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open resume/ })).toHaveAttribute('href', '/dashboard/profile#resume');
  });

  it('load failure hides the breakdown and shows the error note without a primary CTA', () => {
    renderCard({
      factualSummary: READINESS_SCORE_LOAD_ERROR,
      nextAction: null,
      breakdown: null,
      loadFailed: true,
    });
    expect(screen.queryByTestId('readiness-recap-breakdown')).toBeNull();
    expect(screen.getByText(/couldn't load your readiness score/i)).toBeInTheDocument();
    expect(screen.getByText('Couldn’t load')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
