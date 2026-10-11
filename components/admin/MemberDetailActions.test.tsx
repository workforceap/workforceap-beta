import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MemberDetailActions from './MemberDetailActions';
import { buildMemberProgramOptions } from '@/lib/admin/assignableProgramOptions';
import { getProgramBySlug } from '@/lib/content/programs';

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

const grantProgramSlug = 'digital-literacy-empowerment-class';
const wioaProgramSlug = 'it-support-professional-certificate-ibm';
const fundingProps = {
  ...defaultProps,
  enrollmentGateBlocked: true,
  programOptions: [
    { slug: grantProgramSlug, name: 'Digital Literacy' },
    { slug: wioaProgramSlug, name: 'IT Support' },
    { slug: 'tenant-only-track', name: 'Tenant-only track' },
  ],
};

describe('MemberDetailActions program assignment', () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('explains retained agreements, irreversible personal files and conditional restoration before confirming deletion', () => {
    render(<MemberDetailActions {...defaultProps} />);
    expect(screen.queryByRole('button', { name: 'Yes, Delete' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Member Account' }));
    expect(screen.getByText(/Enrollment agreements and their review history are retained in the agreement archive/)).toBeInTheDocument();
    expect(screen.getByText(/Erased personal files cannot be recovered/)).toBeInTheDocument();
    expect(screen.getByText(/Account safeguards may block restoration even while the deleted record remains listed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Yes, Delete' })).not.toBeInTheDocument();
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
    render(<MemberDetailActions {...defaultProps} programOptions={null} />);

    expect(
      screen.queryByRole('option', { name: /curriculum activation pending/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['inactive canonical', [{ slug: 'ai-practitioner-professional-certificate-aws', status: 'inactive' }]],
    ['active alias plus inactive canonical', [
      { slug: 'ai-professional-developer-certificate-ibm', status: 'active' },
      { slug: 'ai-practitioner-professional-certificate-aws', status: 'inactive' },
    ]],
    ['inactive alias', [{ slug: 'ai-professional-developer-certificate-ibm', status: 'inactive' }]],
    ['unknown catalog', [{ slug: 'retired-tenant-track', status: 'active' }]],
  ] as const)('keeps an explicit %s catalog with no assignment choices empty', (_name, rows) => {
    const options = buildMemberProgramOptions(rows, null);
    expect(options).toEqual([]);
    render(<MemberDetailActions {...defaultProps} programOptions={options} />);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an alias-only program as needing repair and keeps a current inactive program disabled', () => {
    const canonical = 'ai-practitioner-professional-certificate-aws';
    const title = getProgramBySlug(canonical)!.title;
    const { unmount } = render(<MemberDetailActions {...defaultProps} programOptions={buildMemberProgramOptions([
      { slug: 'ai-professional-developer-certificate-ibm', status: 'active' },
    ], null)} />);
    expect(screen.getByRole('option', { name: title + ' (needs catalog repair)' })).toBeDisabled();

    unmount();
    render(<MemberDetailActions {...defaultProps} currentProgramSlug={canonical} programOptions={buildMemberProgramOptions([
      { slug: canonical, status: 'inactive' },
    ], canonical)} />);
    expect(screen.getByRole('option', { name: title + ' (inactive)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not describe an existing grant-funded program as WIOA-blocked', () => {
    expect(getProgramBySlug(grantProgramSlug)?.fundingSource).toBe('Grant');
    render(<MemberDetailActions {...fundingProps} currentProgramSlug={grantProgramSlug} />);

    expect(screen.queryByText(/WIOA status is still blocking/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('removes the WIOA warning when the destination switches to Grant and uses the existing PATCH without bypass confirmation', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<MemberDetailActions {...fundingProps} currentProgramSlug={wioaProgramSlug} />);
    expect(screen.getByText(/WIOA status is still blocking/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: grantProgramSlug } });
    expect(screen.queryByText(/WIOA status is still blocking/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/members/member-1/program', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programSlug: grantProgramSlug }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Ada Member is now assigned to Digital Literacy.');
  });

  it('restores the WIOA warning when the destination switches from Grant and cancellation performs no PATCH', () => {
    expect(getProgramBySlug(wioaProgramSlug)?.fundingSource).toBe('WIOA');
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<MemberDetailActions {...fundingProps} currentProgramSlug={grantProgramSlug} />);
    expect(screen.queryByText(/WIOA status is still blocking/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: wioaProgramSlug } });
    expect(screen.getByText(/WIOA status is still blocking/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Enroll Ada Member in IT Support?'));
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preserves the WIOA admin-bypass confirmation before the existing assignment request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<MemberDetailActions {...fundingProps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: wioaProgramSlug } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Admin enrollment will still work and create an admin bypass.'));
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/members/member-1/program', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programSlug: wioaProgramSlug }),
    });
  });

  it('keeps an unmapped tenant program conservatively WIOA-gated and allows confirmation cancellation', () => {
    expect(getProgramBySlug('tenant-only-track')).toBeUndefined();
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<MemberDetailActions {...fundingProps} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tenant-only-track' } });
    expect(screen.getByText(/WIOA status is still blocking/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Enroll Ada Member in Tenant-only track?'));
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('keeps verified or admin-bypassed members free of warnings for a WIOA destination', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<MemberDetailActions {...fundingProps} enrollmentGateBlocked={false} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: wioaProgramSlug } });
    expect(screen.queryByText(/WIOA status is still blocking/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses the Grant exemption with the existing static catalog fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as Response);
    render(<MemberDetailActions {...fundingProps} programOptions={null} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: grantProgramSlug } });
    expect(screen.queryByText(/WIOA status is still blocking/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
