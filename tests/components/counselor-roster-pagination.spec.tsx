import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CounselorsRosterKit } from '@/components/portal/kit/pages/admin-subviews/CounselorsRosterKit';

afterEach(cleanup);
it('submits search to the server and retains the query in pagination links', () => {
  render(<CounselorsRosterKit counselors={[]} total={150} matchingTotal={101} currentPage={2} pageSize={50} searchQuery="Jordan & team" avgCaseload={8} atRiskOwned={3} avgResponse="—" />);
  const input = screen.getByRole('textbox', { name: 'Search counselors' });
  expect(input).toHaveAttribute('name', 'search');
  expect(input.closest('form')).toHaveAttribute('action', '/admin/counselors');
  expect(input.closest('form')).toHaveAttribute('method', 'get');
  fireEvent.change(input, { target: { value: 'New search' } });
  expect(input).toHaveValue('New search');
  expect(screen.getByRole('button', { name: /^Search$/ })).toHaveAttribute('type', 'submit');
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/admin/counselors?search=Jordan+%26+team&page=1');
  expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/admin/counselors?search=Jordan+%26+team&page=3');
  expect(screen.getByText(/Column sorting applies to this page/)).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
});
it('shows distinct search-empty guidance and hides unavailable page links', () => {
  render(<CounselorsRosterKit counselors={[]} total={20} matchingTotal={0} searchQuery="Missing" avgCaseload={8} atRiskOwned={3} avgResponse="—" />);
  expect(screen.getAllByRole('heading', { name: 'No matching counselors' }).length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument();
});
