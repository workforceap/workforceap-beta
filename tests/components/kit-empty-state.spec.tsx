import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));

import { DataTable, KitEmptyState, type KitEmptyKind } from '@/components/portal/kit';
import PortalEmptyState from '@/components/portal/PortalEmptyState';

/**
 * One empty-state component for the four situations (KIT_GUIDE §6): `kind`
 * lands on `data-kind`, picks the default tone, and actions render as kit CTAs.
 */

afterEach(cleanup);

describe('KitEmptyState — kinds and tones', () => {
  it.each<[KitEmptyKind, string]>([
    ['first', 'muted'],
    ['filtered', 'muted'],
    ['unavailable', 'warn'],
    ['clear', 'ok'],
  ])('%s → data-kind and default tone %s via the tone hook', (kind, tone) => {
    render(<KitEmptyState kind={kind} title={`${kind} title`} data-testid="empty" />);
    const root = screen.getByTestId('empty');
    expect(root).toHaveAttribute('data-kind', kind);
    expect(root).toHaveAttribute('data-tone', tone);
    expect(root.className).toContain('wa-kit-empty');
    expect(root.className).toContain(`wa-kit-empty--${kind}`);
    expect(root.className).toContain(`wa-kit-tone--${tone}`);
    expect(root).not.toHaveAttribute('role');
    expect(screen.getByRole('heading', { level: 3, name: `${kind} title` })).toBeInTheDocument();
  });

  it('defaults to kind first when none is given (existing call sites)', () => {
    render(<KitEmptyState title="No rows yet" data-testid="empty" />);
    expect(screen.getByTestId('empty')).toHaveAttribute('data-kind', 'first');
    expect(screen.getByTestId('empty')).toHaveAttribute('data-tone', 'muted');
  });

  it('lets a caller override the tone and announces a failed load as an alert', () => {
    render(<KitEmptyState kind="unavailable" tone="danger" title="Could not load" data-testid="empty" />);
    const root = screen.getByTestId('empty');
    expect(root).toHaveAttribute('data-tone', 'danger');
    expect(root.className).toContain('wa-kit-tone--danger');
    expect(root).toHaveAttribute('role', 'alert');
  });

  it('keeps the heading, description and actions as siblings under one root, on the type floor', () => {
    render(<KitEmptyState kind="first" title="No mentors yet" description="Ask your counselor." headingAs="h2" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'No mentors yet' });
    expect(heading.style.fontSize).toBe('var(--wa-type-body)');
    const shell = heading.parentElement as HTMLElement;
    expect(within(shell).getByText('Ask your counselor.').className).toContain('wa-kit-lede');
  });
});

describe('KitEmptyState — actions and icon', () => {
  it('renders a link primary action, a callback primary action and a ghost secondary link as kit CTAs', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <KitEmptyState kind="first" title="No applications yet" primaryAction={{ label: 'Add application', onClick }} secondaryAction={{ label: 'Browse jobs', href: '/dashboard/jobs' }} />,
    );
    const button = screen.getByRole('button', { name: 'Add application' });
    expect(button.className).toContain('wa-kit-cta');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    const ghost = screen.getByRole('link', { name: 'Browse jobs' });
    expect(ghost).toHaveAttribute('href', '/dashboard/jobs');
    expect(ghost.className).toContain('wa-kit-cta--ghost');

    rerender(<KitEmptyState kind="filtered" title="No matches" primaryAction={{ label: 'Clear filters', href: '/admin/members' }} />);
    const link = screen.getByRole('link', { name: 'Clear filters' });
    expect(link).toHaveAttribute('href', '/admin/members');
    expect(link.className).toContain('wa-kit-cta');
    expect(link.className).not.toContain('wa-kit-cta--ghost');
  });

  it('hides the icon from assistive tech and paints it through the tone icon chip', () => {
    render(<KitEmptyState kind="clear" title="All clear" icon={<span>icon</span>} />);
    const chip = screen.getByText('icon').closest('[aria-hidden]') as HTMLElement;
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    expect(chip.className).toContain('wa-kit-tone-icon');
  });

  it('still renders the deprecated action slot and passes className / style / data-* through', () => {
    render(
      <KitEmptyState title="Legacy" action={<a href="/x" className="wa-kit-cta">Go</a>} className="caller" style={{ marginTop: 4 }} data-testid="legacy" framed />,
    );
    const root = screen.getByTestId('legacy');
    expect(root.className).toContain('caller');
    expect(root.className).toContain('wa-kit-empty--framed');
    expect(root.style.marginTop).toBe('4px');
    expect(screen.getByRole('link', { name: 'Go' })).toBeInTheDocument();
  });

  it('PortalEmptyState is the framed kit empty state', () => {
    const { container } = render(<PortalEmptyState kind="filtered" title="No members match" primaryAction={{ label: 'Clear', href: '/admin/members' }} className="caller-class" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('wa-kit-empty--framed');
    expect(root.className).toContain('caller-class');
    expect(root).toHaveAttribute('data-kind', 'filtered');
    expect(screen.getByRole('link', { name: 'Clear' }).className).toContain('wa-kit-cta');
  });
});

type Row = { id: string; name: string };
const columns = [{ key: 'name', header: 'Name' }];
const rowKey = (row: Row) => row.id;

describe('DataTable — `empty` prop', () => {
  it('renders the kind, description and action from `empty`', () => {
    const clear = vi.fn();
    const { container } = render(
      <DataTable<Row>
        columns={columns}
        rows={[]}
        rowKey={rowKey}
        empty={{ kind: 'filtered', title: 'No members match', description: 'Try a different filter.', primaryAction: { label: 'Clear filters', onClick: clear } }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No members match' })).toBeInTheDocument();
    expect(screen.getByText('Try a different filter.')).toBeInTheDocument();
    expect(container.querySelector('.wa-kit-empty')).toHaveAttribute('data-kind', 'filtered');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('defaults to "No rows yet" / first, and still honours the legacy emptyTitle pair', () => {
    const { container, rerender } = render(<DataTable<Row> columns={columns} rows={[]} rowKey={rowKey} />);
    expect(screen.getByRole('heading', { name: 'No rows yet' })).toBeInTheDocument();
    expect(container.querySelector('.wa-kit-empty')).toHaveAttribute('data-kind', 'first');

    rerender(<DataTable<Row> columns={columns} rows={[]} rowKey={rowKey} emptyTitle="No screenings yet" emptyDescription="Members appear here." />);
    expect(screen.getByRole('heading', { name: 'No screenings yet' })).toBeInTheDocument();
    expect(screen.getByText('Members appear here.')).toBeInTheDocument();

    rerender(<DataTable<Row> columns={columns} rows={[]} rowKey={rowKey} emptyTitle="Legacy" empty={{ kind: 'clear', title: 'Nothing waiting' }} />);
    expect(screen.getByRole('heading', { name: 'Nothing waiting' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Legacy' })).toBeNull();
    expect(container.querySelector('.wa-kit-empty')).toHaveAttribute('data-kind', 'clear');
  });

  it('uses the same empty state in the mobile-cards branch', () => {
    const { container } = render(
      <DataTable<Row> columns={columns} rows={[]} rowKey={rowKey} mobile="cards" cardRender={(row) => <p>{row.name}</p>} empty={{ kind: 'unavailable', title: 'Not available yet' }} />,
    );
    const empties = container.querySelectorAll('.wa-kit-empty[data-kind="unavailable"]');
    expect(empties).toHaveLength(2);
    expect(screen.getAllByRole('heading', { name: 'Not available yet' })).toHaveLength(2);
  });
});
