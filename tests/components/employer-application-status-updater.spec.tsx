/**
 * Vision B1 (V09): the application detail status control offers only the
 * moves the server accepts, shows the server's reason when a move is refused,
 * and asks before marking someone hired.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

// The spinner reads window.matchMedia (reduced motion), which jsdom lacks.
vi.mock('@/components/portal/PortalInlineSpinner', () => ({ PortalInlineSpinner: () => null }));

import ApplicationStatusUpdater from '@/components/employer/ApplicationStatusUpdater';
import JobApplicantsClient from '@/components/employer/JobApplicantsClient';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const optionValues = () =>
  Array.from((screen.getByRole('combobox') as HTMLSelectElement).options).map((o) => o.value);

describe('ApplicationStatusUpdater', () => {
  it('from pending, offers exactly pending, reviewing, interview and rejected', () => {
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="pending" />);
    expect(optionValues()).toEqual(['pending', 'reviewing', 'interview', 'rejected']);
    expect(optionValues()).not.toContain('hired');
  });

  it('from hired, offers only hired (no further moves here)', () => {
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="hired" />);
    expect(optionValues()).toEqual(['hired']);
  });

  it("shows the server's reason on a 409 and keeps the current status selected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'stale', error: 'This application was updated by someone else. Reload to see the latest.' }),
    );
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="pending" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reviewing' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This application was updated by someone else. Reload to see the latest.',
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('pending');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('falls back to the generic message when the error body has no text', async () => {
    fetchMock.mockResolvedValue(new Response('oops', { status: 500 }));
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="pending" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reviewing' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update status. Try again.');
  });

  it('choosing hired from offered asks first and does not fetch until Confirm', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, application: { id: 'a1', status: 'hired' } }));
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="offered" />);
    expect(optionValues()).toEqual(['interview', 'offered', 'hired', 'rejected']);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hired' } });
    expect(
      screen.getByText(
        "Mark as hired? This tells the candidate and sends the hire to WorkforceAP staff to verify. You can't change it here afterwards.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/employer/applications/a1');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ status: 'hired' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('Cancel on the hire confirmation sends nothing and keeps the current status', () => {
    render(<ApplicationStatusUpdater applicationId="a1" currentStatus="offered" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'hired' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Mark as hired\?/)).not.toBeInTheDocument();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('offered');
  });
});


describe('JobApplicantsClient stage <select>', () => {
  const applicant = (status: 'pending' | 'reviewing' | 'interview' | 'offered' | 'hired' | 'rejected') => ({
    id: 'a1',
    status,
    appliedAt: '2026-09-01T00:00:00Z',
    employerNotes: null,
    student: { id: 's1', fullName: 'Ada Applicant', email: 'ada@example.test' },
  });
  const selects = () => screen.getAllByLabelText('Update application status for Ada Applicant') as HTMLSelectElement[];

  it('offers the current stage plus the allowed next stages, in both layouts', () => {
    render(<JobApplicantsClient jobId="job-1" initialApplicants={[applicant('pending')]} />);
    expect(selects().length).toBeGreaterThanOrEqual(1);
    for (const select of selects()) {
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['pending', 'reviewing', 'interview', 'rejected']);
    }
  });

  it("shows the server's 409 reason and reverts the select", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'invalid_transition', error: "That move isn't available from New.", allowed: [] }),
    );
    render(<JobApplicantsClient jobId="job-1" initialApplicants={[applicant('pending')]} />);
    fireEvent.change(selects()[0], { target: { value: 'interview' } });
    expect(await screen.findByRole('alert')).toHaveTextContent("That move isn't available from New.");
    for (const select of selects()) expect(select.value).toBe('pending');
  });
});
