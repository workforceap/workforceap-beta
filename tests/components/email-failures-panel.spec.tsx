/**
 * WAP-163: the diagnostics page lists failed sends and offers Resend only for
 * rows that can actually be replayed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EmailFailuresPanel, type EmailFailureRow } from '@/components/portal/kit/pages/admin-subviews/EmailFailuresPanel';

const base: EmailFailureRow = {
  id: 'row',
  createdAt: '2026-09-19T10:00:00.000Z',
  template: 'applicant_followup',
  templateLabel: 'Applicant Day-3 follow-up',
  subject: 'Your WorkforceAP Application is Being Reviewed',
  to: ['ada@example.org'],
  errorClass: 'header_invalid',
  retryable: true,
  resendable: true,
  failureReason: 'Header keys and values cannot contain carriage return',
  resentAt: null,
  resentOk: null,
};

const rows: EmailFailureRow[] = [
  { ...base, id: 'replayable' },
  { ...base, id: 'legacy', template: null, templateLabel: null, subject: 'We Miss You at WorkforceAP', to: ['x@example.org'], errorClass: 'unknown', resendable: false, failureReason: null },
  { ...base, id: 'done', resentAt: '2026-09-20T09:00:00.000Z', resentOk: true },
  { ...base, id: 'rejected', errorClass: 'provider_rejected', retryable: false },
];

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('EmailFailuresPanel', () => {
  it('shows the 24h count against the threshold and one row per failure', () => {
    render(<EmailFailuresPanel rows={rows} failures24h={2} windowDays={7} threshold={0} />);
    expect(screen.getByTestId('email-failures-24h')).toHaveTextContent('2 failed in the last 24h');
    expect(screen.getByTestId('email-failures-24h').className).toContain('wa-kit-tag--alert');
    expect(screen.getAllByText('Applicant Day-3 follow-up')).toHaveLength(3);
    expect(screen.getByText('We Miss You at WorkforceAP')).toBeInTheDocument();
    expect(screen.getAllByText('Bad header')).toHaveLength(2);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getAllByText('No')).toHaveLength(1);
  });

  it('reads healthy when nothing failed in the window', () => {
    render(<EmailFailuresPanel rows={[]} failures24h={0} windowDays={7} threshold={0} />);
    expect(screen.getByTestId('email-failures-24h')).toHaveTextContent('No failures in the last 24h');
    expect(screen.getByTestId('email-failures-24h').className).toContain('wa-kit-tag--ok');
    expect(screen.getByText('No failed sends recorded')).toBeInTheDocument();
  });

  it('disables Resend for rows recorded without a template and for rows already re-sent', () => {
    render(<EmailFailuresPanel rows={rows} failures24h={0} windowDays={7} threshold={0} />);
    // Astryx Button exposes disabled state through aria-disabled.
    expect(screen.getByTestId('resend-legacy')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText(/Recorded without a template/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('resend-done')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/^Re-sent Sep/)).toBeInTheDocument();
    expect(screen.getByTestId('resend-replayable')).not.toHaveAttribute('aria-disabled', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to the resend route for a replayable row and shows the outcome', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, resentAt: '2026-09-20T12:00:00.000Z' }) });
    render(<EmailFailuresPanel rows={[rows[0]]} failures24h={1} windowDays={7} threshold={0} />);
    fireEvent.click(screen.getByTestId('resend-replayable'));
    await waitFor(() => expect(screen.getByTestId('resend-message-replayable')).toHaveTextContent('Re-sent'));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/admin/email-failures/replayable/resend', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('resend-replayable')).toHaveAttribute('aria-disabled', 'true');
  });

  it('surfaces the route error and leaves the row re-sendable', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({ ok: false, error: 'The email provider did not accept the re-send. The new failure was recorded.' }) });
    render(<EmailFailuresPanel rows={[rows[0]]} failures24h={1} windowDays={7} threshold={0} />);
    fireEvent.click(screen.getByTestId('resend-replayable'));
    await waitFor(() => expect(screen.getByTestId('resend-message-replayable')).toHaveTextContent(/did not accept the re-send/));
    expect(screen.getByTestId('resend-replayable')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
