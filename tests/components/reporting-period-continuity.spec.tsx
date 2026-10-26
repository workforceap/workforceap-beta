import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportingHubKit } from '@/components/portal/kit/pages/admin-subviews/ReportingHubKit';
import { ReportingExportsSection } from '@/app/admin/reporting/sections/ExportsSection';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
afterEach(cleanup);

describe('Reporting context and period continuity', () => {
  it('keeps the selected outcomes period in every view and the printable board link', () => {
    render(<ReportingHubKit activeTab="outcomes" period="ytd"><p>Outcomes</p></ReportingHubKit>);
    const links = within(screen.getByRole('navigation', { name: 'Reporting views' })).getAllByRole('link');
    expect(links).toHaveLength(5);
    for (const link of links) expect(new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get('period')).toBe('ytd');
    expect(screen.getByRole('link', { name: /Board report \(print\)/ })).toHaveAttribute('href', '/admin/board/print?period=ytd');
    const context = screen.getByRole('complementary', { name: 'Report context' });
    expect(context).toHaveTextContent('This organization');
    expect(context).toHaveTextContent('rolling windows');
  });

  it('does not relabel the training roster as filtered by the retained outcomes period', () => {
    render(<ReportingHubKit activeTab="training" period="ytd"><p>Training rows</p></ReportingHubKit>);
    expect(screen.getByTestId('reporting-context')).toHaveTextContent('Latest saved training progress');
    expect(screen.getByTestId('reporting-context')).toHaveTextContent('The outcomes period does not filter this roster.');
    expect(screen.getByRole('link', { name: 'Outcomes' })).toHaveAttribute('href', '/admin/reporting?tab=outcomes&period=ytd');
  });

  it('uses the selected period in the actual outcomes file endpoints and keeps specialized export forms reachable', async () => {
    const { container } = render(await ReportingExportsSection({ period: 'ytd' }));
    const hrefs = Array.from(container.querySelectorAll('a'), link => link.getAttribute('href'));
    expect(hrefs).toContain('/api/admin/outcomes/snapshot?period=ytd&format=csv');
    expect(hrefs).toContain('/api/admin/outcomes/snapshot?period=ytd&format=pdf');
    expect(hrefs).toContain('/admin/exports?ui=legacy');
    expect(hrefs).toContain('/admin/exports?ui=legacy#eligibility-datasheet');
  });
});
