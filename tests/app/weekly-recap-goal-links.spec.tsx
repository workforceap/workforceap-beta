import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import MotivatingRecapClient, { type MotivatingRecapData } from '@/app/(portal)/dashboard/weekly-recap/MotivatingRecapClient';

/**
 * WAP-197 item 8: goals live in the career brief's #goals section (WAP-188).
 * Recaps are stored when generated, and those written before that sent goal
 * steps to the bare /dashboard/career-brief. A goal link lands on #goals;
 * the page-level "Career Brief" link and non-goal plan items are unchanged.
 */
const recap = { id: 'recap-1', readinessScoreSnapshot: 40 };

function renderRecap(data: MotivatingRecapData) {
  return render(<MotivatingRecapClient recap={recap} recapData={data} weekStart="2026-09-14" />);
}

afterEach(cleanup);

describe('weekly recap goal links (WAP-197)', () => {
  it('a stored goal step pointing at the bare career brief opens its #goals section', () => {
    renderRecap({
      nextWeekPlan: [
        { key: 'goal:g-1', title: 'Write a pivot story', href: '/dashboard/career-brief', cta: 'Open career brief', source: 'goal' },
        { key: 'goal:g-2', title: 'Tick off step two', href: '/dashboard/career-brief#goals', cta: 'View goal', source: 'goal' },
      ],
    });
    expect(screen.getByRole('link', { name: /Write a pivot story/ })).toHaveAttribute('href', '/dashboard/career-brief#goals');
    expect(screen.getByRole('link', { name: /Tick off step two/ })).toHaveAttribute('href', '/dashboard/career-brief#goals');
  });

  it('leaves goal steps with their own tool and non-goal actions alone', () => {
    renderRecap({
      nextWeekPlan: [
        { key: 'goal:g-3', title: 'Polish resume', href: '/dashboard/ai-tools/resume-studio?view=rewrite', source: 'goal' },
        { key: 'action:a-1', title: 'Read the brief', href: '/dashboard/career-brief', source: 'action' },
      ],
    });
    expect(screen.getByRole('link', { name: /Polish resume/ })).toHaveAttribute('href', '/dashboard/ai-tools/resume-studio?view=rewrite');
    expect(screen.getByRole('link', { name: /Read the brief/ })).toHaveAttribute('href', '/dashboard/career-brief');
  });

  it('the goals section links to the goals, the page nav link stays the plain career brief', () => {
    renderRecap({ goalProgress: [{ id: 'g-1', title: 'Finish resume', status: 'ACTIVE', stepsDone: 1, stepsTotal: 3 }] });
    const heading = screen.getByRole('heading', { name: 'Progress toward your goals' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByRole('link', { name: /Open your goals/ })).toHaveAttribute('href', '/dashboard/career-brief#goals');
    expect(screen.getByRole('link', { name: /Career Brief/ })).toHaveAttribute('href', '/dashboard/career-brief');
  });

  it('uses the translated label from the page and keeps the arrow out of the accessible name', () => {
    render(
      <MotivatingRecapClient
        recap={recap}
        recapData={{ goalProgress: [{ id: 'g-1', title: 'Terminar el currículum', status: 'ACTIVE' }] }}
        weekStart="2026-09-14"
        openGoalsLabel="Abrir tus metas"
      />,
    );
    const link = screen.getByRole('link', { name: 'Abrir tus metas' });
    expect(link).toHaveAttribute('href', '/dashboard/career-brief#goals');
    expect(link.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
  });

  it('shows no goals link when the recap has no goals', () => {
    renderRecap({ wins: [{ label: 'Applied to two roles' }] });
    expect(screen.queryByRole('link', { name: /Open your goals/ })).toBeNull();
  });
});
