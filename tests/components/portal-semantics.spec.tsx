import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { UsersKit } from '@/components/portal/kit/pages/admin-subviews/UsersKit';
import { JobsBoardKit } from '@/components/portal/kit/pages/admin-subviews/JobsBoardKit';
import { CronsMonitorKit } from '@/components/portal/kit/pages/admin-subviews/CronsMonitorKit';
import { PlacementsKit } from '@/components/portal/kit/pages/admin-subviews/PlacementsKit';
import { CounselorsRosterKit } from '@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit';
import { PipelineFunnelKit } from '@/components/portal/kit/pages/admin-subviews/PipelineFunnelKit';
import { VoiceStudioKit } from '@/components/portal/kit/pages/VoiceStudioKit';
import { SectionHeader } from '@/components/portal/kit/SectionHeader';
import PortalEmptyState from '@/components/portal/PortalEmptyState';
import DataTable from '@/components/portal/ui/DataTable';
import AssessmentsTable from '@/components/admin/AssessmentsTable';
import { statusToneToKitTone, badgeVariantToStatusTone } from '@/lib/ui/statusToneAdapters';
import { toneToTokenColor } from '@/components/portal/kit/astryxMap';
import { statusColor, type StatusTone } from '@/lib/ui/statusColors';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }), usePathname: () => '/dashboard/ai-tools', useSearchParams: () => mocks.params }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('bounded page and content semantics', () => {
  const pages: [string, ReactNode][] = [
    ['Staff & admins', <UsersKit key="UsersKit" users={[]} total={0} />],
    ['Jobs', <JobsBoardKit key="JobsBoardKit" jobs={[]} openRoles={0} employers={0} />],
    ['Cron Monitor', <CronsMonitorKit key="CronsMonitorKit" jobs={[]} totalJobs={0} enabled={0} failing={0} lastRun="—" />],
    ['Placements', <PlacementsKit key="PlacementsKit" placements={[]} ytd={0} avgWage="—" retention90d="—" toConfirm={0} total={0} />],
    ['Counselors', <CounselorsRosterKit key="CounselorsRosterKit" counselors={[]} total={0} avgCaseload={0} atRiskOwned={0} avgResponse="—" />],
    ['Applications funnel', <PipelineFunnelKit key="PipelineFunnelKit" funnel={[]} />],
  ];
  it.each(pages)('%s has exactly one page heading even with no data', (title, page) => {
    render(page);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it('preserves placement actions and distinguishes a failed load from an empty list', () => {
    render(<PlacementsKit placements={[]} ytd={0} avgWage="—" retention90d="—" toConfirm={0} total={0} loadError="Could not load placements" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load placements');
    expect(screen.getByRole('link', { name: 'Record placement' })).toHaveAttribute('href', '/admin/placements/new');
    expect(screen.getByRole('link', { name: 'Retention decisions due' })).toHaveAttribute('href', '/admin/placements/retention');
  });

  it('keeps section headings h2 and a populated funnel under its page h1', () => {
    render(<><PipelineFunnelKit funnel={[{ label: 'Started', value: '2', pct: 100 }]} /><SectionHeader title="Independent subsection" /></>);
    expect(screen.getByRole('heading', { level: 2, name: 'Funnel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Independent subsection' })).toBeInTheDocument();
  });

  it('uses a named region for each radio-selected voice section with no inert focus stop', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const view = render(<VoiceStudioKit />);
    for (const name of ['Coaches', 'Practice', 'Resume', 'All Tools']) {
      fireEvent.click(screen.getByRole('radio', { name }));
      expect(screen.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
      const region = screen.getByRole('region', { name });
      expect(region).not.toHaveAttribute('tabindex');
      expect(region).not.toHaveAttribute('aria-labelledby');
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
      for (const element of view.container.querySelectorAll('[aria-labelledby]')) {
        for (const id of element.getAttribute('aria-labelledby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull();
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets empty states match heading context while preserving callback and link actions', () => {
    const retry = vi.fn();
    const { container } = render(<PortalEmptyState title="No matches" description="Try another filter." headingAs="h2" icon={<span>Decorative icon</span>} primaryAction={{ label: 'Try again', onClick: retry }} secondaryAction={{ label: 'All members', href: '/admin/members' }} className="caller-class" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No matches' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'All members' })).toHaveAttribute('href', '/admin/members');
    expect(container.firstElementChild).toHaveClass('caller-class');
    expect(screen.getByText('Decorative icon').closest('[aria-hidden]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('retains nested empty-state h3 defaults and navigation as links', () => {
    render(<PortalEmptyState title="No sessions" primaryAction={{ label: 'Schedule', href: '/dashboard/sessions' }} />);
    expect(screen.getByRole('heading', { level: 3, name: 'No sessions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/dashboard/sessions');
  });
});

describe('mobile data labels', () => {
  it('derives plain labels, preserves rich overrides and hides headers with their cells', () => {
    const onSort = vi.fn();
    render(<DataTable rows={[{ id: '1' }]} rowKey={(row) => row.id} columns={[
      { key: 'plain', header: 'Name', cell: () => 'Taylor', rowHeader: true },
      { key: 'numeric', header: 2026, cell: () => 'Value' },
      { key: 'rich', header: <button onClick={onSort}>Sort score</button>, cellDataLabel: 'Score', ariaSort: 'ascending', cell: () => '80%' },
      { key: 'hidden', header: 'Email', hideOnMobile: true, cell: () => 'example@example.test' },
    ]} />);
    expect(screen.getByRole('rowheader', { name: 'Taylor' })).toHaveAttribute('data-label', 'Name');
    expect(screen.getByRole('cell', { name: 'Value' })).toHaveAttribute('data-label', '2026');
    expect(screen.getByRole('cell', { name: '80%' })).toHaveAttribute('data-label', 'Score');
    expect(screen.getByRole('columnheader', { name: 'Sort score' })).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort score' }));
    expect(onSort).toHaveBeenCalledOnce();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toHaveClass('wa-hidden', 'md:wa-table-cell');
    expect(screen.getByRole('cell', { name: 'example@example.test' })).toHaveClass('wa-hidden', 'md:wa-table-cell');
  });

  it('preserves explicit custom-row labels without assigning column labels to spanning category rows', () => {
    render(<DataTable rows={[{ id: 'category' }, { id: 'record' }]} rowKey={(row) => row.id} columns={[{ key: 'value', header: 'Value', cell: () => 'unused' }]} renderBodyRow={(row) => row.id === 'category' ? <tr><td colSpan={1}>Category heading</td></tr> : <tr><td data-label="Custom detail">Record</td></tr>} />);
    expect(screen.getByRole('cell', { name: 'Record' })).toHaveAttribute('data-label', 'Custom detail');
    expect(screen.getByRole('cell', { name: 'Category heading' })).not.toHaveAttribute('data-label');
  });

  it('provides meaningful rich-header labels in the actual assessment table without breaking sorting', () => {
    render(<AssessmentsTable users={[{ id: 'fixture', fullName: 'Taylor Example', email: 'example@example.test', phone: null, programInterest: null, assessmentScore: 8, assessmentScorePct: 80, assessmentCompletedAt: new Date('2026-09-01T12:00:00Z'), assessmentAnswers: {} }]} correctnessByUserId={{}} totalCount={1} currentPage={1} pageSize={20} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('cell', { name: /Taylor Example/ })).toHaveAttribute('data-label', 'Name');
    expect(within(table).getByRole('cell', { name: '80%' })).toHaveAttribute('data-label', 'Score %');
    expect(table.querySelector('[data-label="Date completed"]')).not.toBeNull();
    fireEvent.click(within(table).getByRole('button', { name: /^Score %/ }));
    expect(within(table).getByRole('cell', { name: '80%' })).toHaveAttribute('data-label', 'Score %');
  });
});

describe('status vocabulary adapters', () => {
  it('preserves all legacy meanings and keeps destructive kit danger separate', () => {
    const mapping = { success: ['ok', 'green'], warning: ['warn', 'yellow'], danger: ['alert', 'pink'], info: ['info', 'blue'], neutral: ['muted', 'gray'] } as const;
    for (const tone of Object.keys(mapping) as StatusTone[]) {
      const kitTone = statusToneToKitTone(tone);
      expect(kitTone).toBe(mapping[tone][0]);
      expect(toneToTokenColor(kitTone)).toBe(mapping[tone][1]);
    }
    expect(toneToTokenColor('danger')).toBe('red');
    expect(badgeVariantToStatusTone('error')).toBe('danger');
    expect(badgeVariantToStatusTone('accent')).toBe('danger');
    expect(statusColor(badgeVariantToStatusTone('error')).fg).toBe('var(--wa-accent-text)');
  });
});
