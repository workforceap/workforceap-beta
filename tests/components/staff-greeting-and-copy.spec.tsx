import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CounselorHomeKit } from '@/components/portal/kit/pages/counselor/CounselorHomeKit';
import { EmployerHomeKit } from '@/components/portal/kit/pages/employer/EmployerHomeKit';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import { PartnerHomeOpener, PartnerKpiGrid } from '@/components/portal/kit/pages/PartnerOverviewKit';
import { staffWelcomeTitle } from '@/components/portal/kit/pages/StaffKit';
import { PROGRAM_HEALTH_CAPTION } from '@/lib/admin/commandCenterHelpers';

/**
 * Round 3, staff lane. One greeting for every person-facing home
 * ("Welcome back, {first name}."), workspace pages keep their title, and the
 * long explainers are one line plus a disclosure with the full text intact.
 */
describe('one greeting across person-facing homes', () => {
  it('formats the English fallback with a trailing period', () => {
    expect(staffWelcomeTitle('Alex')).toBe('Welcome back, Alex.');
    expect(staffWelcomeTitle('  Alex ')).toBe('Welcome back, Alex.');
  });

  it('counselor home greets by first name and keeps "Caseload" without one', () => {
    const { unmount } = render(<CounselorHomeKit firstName="Alex" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Alex.' })).toBeInTheDocument();
    unmount();
    render(<CounselorHomeKit />);
    expect(screen.getByRole('heading', { level: 1, name: 'Caseload' })).toBeInTheDocument();
  });

  it('prefers a translated title passed by the page', () => {
    render(<CounselorHomeKit firstName="Alex" welcomeTitle="Bienvenido de nuevo, Alex." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenido de nuevo, Alex.' })).toBeInTheDocument();
  });

  it('employer home greets by first name and stays "Hiring" without one', () => {
    const { unmount } = render(<EmployerHomeKit firstName="Jordan" companyName="Acme" openRoles={2} inPipeline={1} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Jordan.' })).toBeInTheDocument();
    expect(screen.getByText('Acme: 2 open roles and 1 candidate in your pipeline.')).toBeInTheDocument();
    unmount();
    render(<EmployerHomeKit companyName="Acme" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hiring' })).toBeInTheDocument();
    expect(screen.getByText('Acme. Post a role to start building your pipeline.')).toBeInTheDocument();
  });

  it('partner opener greets by first name and falls back to the partner name', () => {
    const { unmount } = render(<PartnerHomeOpener firstName="Sam" partnerName="Skillpoint" meta="2 placements are waiting." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Sam.' })).toBeInTheDocument();
    unmount();
    render(<PartnerHomeOpener partnerName="Skillpoint" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Skillpoint' })).toBeInTheDocument();
  });

  it('admin Command Center keeps its workspace title', () => {
    render(<CommandCenterKit />);
    expect(screen.getByRole('heading', { level: 1, name: 'Command Center' })).toBeInTheDocument();
  });
});

describe('one-line copy with a disclosure', () => {
  it('employer community impact is one line; where it goes is collapsed', () => {
    const { container } = render(<EmployerHomeKit companyName="Acme" hires={3} />);
    const line = screen.getByText('WorkforceAP reinvests 10% of every first-year salary from your hires.');
    expect(line.textContent!.length).toBeLessThan(90);
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('It funds scholarships and training for the next cohort.');
  });

  it('admin enrollment caption: one visible line, full definition kept in the disclosure', () => {
    const { container } = render(
      <CommandCenterKit programHealth={[{ label: 'Cloud & IT', value: '312 enrolled', pct: 37 }]} programHealthCaption={PROGRAM_HEALTH_CAPTION} />,
    );
    const caption = container.querySelector('[data-program-health-caption]')!;
    expect(caption.querySelector('p')!.textContent!.length).toBeLessThan(90);
    const details = caption.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent(PROGRAM_HEALTH_CAPTION);
  });
});

describe('flat KPI strip', () => {
  it('partner KPIs use the shared strip and keep every caption inside its tile', () => {
    render(
      <PartnerKpiGrid
        items={[
          { label: 'Members referred', value: 12, subtitle: 'In your portal' },
          { label: 'Members enrolled', value: 6, subtitle: 'Started a program', spark: { series: [1, 2, 3], delta: '+2', direction: 'up' } },
        ]}
      />,
    );
    expect(screen.getByText('In your portal')).toBeInTheDocument();
    expect(screen.getByText('Started a program')).toBeInTheDocument();
    expect(screen.getByText('Members referred').closest('[class*="kpis"]')).not.toBeNull();
  });
});
