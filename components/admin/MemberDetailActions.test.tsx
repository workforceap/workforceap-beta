import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MemberDetailActions from './MemberDetailActions';

const refresh = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const defaultProps = {
  userId: 'member-1',
  memberName: 'Ada Member',
  enrollmentGateBlocked: false,
  currentProgramSlug: null,
  assessmentCompleted: false,
  programOptions: [{ slug: 'data-analytics', name: 'Data Analytics' }],
};

describe('MemberDetailActions program assignment', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warns about irreversible files and conditional restoration before member deletion', () => {
    render(<MemberDetailActions {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Member Account' }));
    expect(screen.getByText(/Erased files cannot be recovered/)).toBeInTheDocument();
    expect(screen.getByText(/Account safeguards may block restoration/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the server error when program assignment fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Member is outside your organization.' }),
    } as Response);

    render(<MemberDetailActions {...defaultProps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data-analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Member is outside your organization.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('confirms a successful assignment and refreshes the member page', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    render(<MemberDetailActions {...defaultProps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data-analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ada Member is now assigned to Data Analytics.',
    );
    expect(fetch).toHaveBeenCalledWith('/api/admin/members/member-1/program', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programSlug: 'data-analytics' }),
    });
  });

  it('shows a reachable error when the request itself fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

    render(<MemberDetailActions {...defaultProps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data-analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
  });

  it('keeps a current paused curriculum visible but prevents re-assignment', () => {
    render(
      <MemberDetailActions
        {...defaultProps}
        currentProgramSlug="paused-program"
        programOptions={[
          {
            slug: 'paused-program',
            name: 'Database Administrator',
            curriculumMigrationPending: true,
          },
          { slug: 'data-analytics', name: 'Data Analytics' },
        ]}
      />,
    );

    const pausedOption = screen.getByRole('option', {
      name: /Database Administrator.*curriculum activation pending/i,
    });
    expect(pausedOption).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/remains visible for continuity/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not offer paused curricula for a fresh assignment in fallback options', () => {
    render(<MemberDetailActions {...defaultProps} programOptions={[]} />);

    expect(
      screen.queryByRole('option', { name: /curriculum activation pending/i }),
    ).not.toBeInTheDocument();
  });
});
