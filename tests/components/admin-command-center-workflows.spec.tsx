import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminCommandCenterClient from '@/components/admin/AdminCommandCenterClient';
import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import type { AdminApplicationPendingRow, AdminCommandCenter, AdminQueueKey } from '@/lib/admin/commandCenterHelpers';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), fetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/components/admin/ConfirmDialog', () => ({
  default: ({ open, title, body, busy, confirmDisabled, onConfirm, onCancel }: {
    open: boolean; title: string; body: ReactNode; busy: boolean; confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void;
  }) => open ? (
    <div role="dialog" aria-label={title}>
      {body}
      <button type="button" disabled={busy || confirmDisabled} onClick={onConfirm}>Confirm bulk review</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancel bulk review</button>
    </div>
  ) : null,
}));
vi.mock('@astryxdesign/core/Pagination', () => ({
  Pagination: ({ page, pageSize, totalItems, label, onChange }: {
    page: number; pageSize: number; totalItems: number; label: string; onChange: (page: number) => void;
  }) => (
    <nav aria-label={label}>
      <span>Page {page}, {pageSize} per page, {totalItems} items</span>
      <button type="button" onClick={() => onChange(page + 1)}>Next page</button>
    </nav>
  ),
}));

function application(id: string): AdminApplicationPendingRow {
  return {
    applicationId: `application-${id}`, memberId: `member-${id}`, memberName: `Applicant ${id}`,
    memberEmail: `${id}@example.invalid`, phone: null, programLabel: 'IT support', status: 'PENDING',
    statusLabel: 'Pending', submittedAt: new Date('2026-09-01T12:00:00Z'), submittedDaysAgo: 8,
    recommendedCareerTitle: null,
    emailPacket: { subject: 'Application next step', body: 'Review this application.', mailto: `mailto:${id}@example.invalid` },
  };
}

function center(overrides: Partial<AdminCommandCenter> = {}): AdminCommandCenter {
  return {
    needsReply: [{ memberId: 'reply-member', memberName: 'Waiting Member', memberEmail: 'reply@example.invalid',
      threadId: 'thread-1', lastMessageBody: 'Please help with my next step.', lastMessageAt: new Date('2026-09-08T12:00:00Z'), hoursWaiting: 24 }],
    atRisk: [{ memberId: 'risk-member', memberName: 'Check-in Member', memberEmail: 'risk@example.invalid',
      daysInactive: 20, enrolledProgram: null }],
    interviewing: [{ memberId: 'interview-member', memberName: 'Interview Member', memberEmail: 'interview@example.invalid',
      company: 'Example employer', role: 'Support associate', statusLabel: 'Interviewing', nextInterviewDate: null }],
    applicationsPending: [application('a'), application('b')], programHealth: [],
    totals: { needsReplyCount: 31, atRiskCount: 42, interviewingCount: 53, applicationsPendingCount: 64,
      certificationsPendingCount: 0, oldestPendingApplicationDays: 8 },
    ...overrides,
  };
}

function confirmBulkInfo() {
  fireEvent.click(screen.getByRole('button', { name: /^Ask for info \(\d+\)$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm bulk review' }));
}

function requestBody(index = 0): { applicationIds: string[]; status: string; verified?: boolean } {
  return JSON.parse(mocks.fetch.mock.calls[index][1].body);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('admin command-center queues', () => {
  it('uses full queue counts and view-all links even when only a small row preview is loaded', () => {
    render(<AdminCommandCenterClient data={center()} />);
    expect(screen.getByRole('heading', { name: '190 items need a next step' })).toBeInTheDocument();
    for (const [queue, count] of [['needs-reply', 31], ['at-risk', 42], ['interviewing', 53], ['applications', 64]]) {
      expect(screen.getByRole('link', { name: `View all ${count} items` }))
        .toHaveAttribute('href', `/admin/command-center?queue=${queue}&page=1`);
    }
    expect(screen.getAllByRole('checkbox', { name: /^Select Applicant/ })).toHaveLength(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each<{ queue: AdminQueueKey; title: string; count: number }>([
    { queue: 'needs-reply', title: 'Needs Reply', count: 31 },
    { queue: 'at-risk', title: 'At Risk', count: 42 },
    { queue: 'interviewing', title: 'Interview prep', count: 53 },
    { queue: 'applications', title: 'Applications Pending', count: 64 },
  ])('keeps the focused $queue queue when moving to the next page', ({ queue, title, count }) => {
    render(<AdminCommandCenterClient data={center({ pagination: { queue, page: 2, pageSize: 25 } })} />);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    const pagination = screen.getByRole('navigation', { name: `${title} pages` });
    expect(within(pagination).getByText(`Page 2, 25 per page, ${count} items`)).toBeInTheDocument();
    fireEvent.click(within(pagination).getByRole('button', { name: 'Next page' }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/admin/command-center?queue=${queue}&page=3`);
    expect(screen.getByRole('link', { name: 'All queues' })).toHaveAttribute('href', '/admin/command-center');
    expect(screen.queryByRole('link', { name: /^View all/ })).not.toBeInTheDocument();
  });

  // WAP-190: the rail badge that opens this queue counts PENDING member
  // applications only; the header counts both statuses over every account.
  it('puts the rail badge number under the Applications count and accounts for the rest', () => {
    const data = center({ pagination: { queue: 'applications', page: 1, pageSize: 25 } });
    data.totals = { ...data.totals, applicationsPendingCount: 7, applicationsWaitingOn: { decision: 3, applicant: 2 } };
    render(<AdminCommandCenterClient data={data} />);
    expect(screen.getByTestId('bucket-summary-applications')).toHaveTextContent(
      '3 waiting on your decision · 2 waiting on the applicant · 2 from staff or test accounts',
    );
  });

  it('prints no split when the loader did not count one, or nothing is open', () => {
    const { unmount } = render(<AdminCommandCenterClient data={center()} />);
    expect(screen.queryByTestId('bucket-summary-applications')).toBeNull();
    unmount();
    const empty = center();
    empty.totals = { ...empty.totals, applicationsPendingCount: 0, applicationsWaitingOn: { decision: 0, applicant: 0 } };
    render(<AdminCommandCenterClient data={empty} />);
    expect(screen.queryByTestId('bucket-summary-applications')).toBeNull();
  });
});

describe('admin bulk review selection and recovery', () => {
  it('selects and submits only this page, not the full queue count', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ processedCount: 2, failedCount: 0, failures: [] }));
    render(<AdminCommandCenterClient data={center({ pagination: { queue: 'applications', page: 2, pageSize: 25 } })} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    expect(screen.getByRole('button', { name: 'Ask for info (2)' })).toBeInTheDocument();
    confirmBulkInfo();
    await screen.findByText('Ask for info: 2 done.');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/admin/applications/bulk-review');
    expect(requestBody()).toMatchObject({ applicationIds: ['application-a', 'application-b'], status: 'NEEDS_INFO' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('checkbox', { name: 'Select this page' })).not.toBeChecked();
  });

  it('removes refreshed-away rows from the active selection and the next request', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ processedCount: 1, failedCount: 0, failures: [] }));
    const { rerender } = render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    rerender(<AdminCommandCenterClient data={center({ applicationsPending: [application('b'), application('c')] })} />);
    expect(screen.getByRole('button', { name: 'Ask for info (1)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Applicant c' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Select Applicant a' })).not.toBeInTheDocument();
    confirmBulkInfo();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(requestBody().applicationIds).toEqual(['application-b']);
  });

  it('hides bulk controls when a refresh replaces every selected row', () => {
    const { rerender } = render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    rerender(<AdminCommandCenterClient data={center({ applicationsPending: [application('c')] })} />);
    expect(screen.getByRole('checkbox', { name: 'Select this page' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /\(\d+\)$/ })).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('retains selection after a network failure and explains that the outcome is uncertain', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('Network connection dropped after sending request'));
    render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    confirmBulkInfo();
    expect(await screen.findByRole('alert')).toHaveTextContent('The review response could not be confirmed. Reload the queue before retrying; some items may have completed.');
    expect(screen.getByRole('checkbox', { name: 'Select Applicant a' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).toBeChecked();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('keeps failed IDs selected after a partial result and retries only those IDs', async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ processedCount: 1, failedCount: 1,
        failures: [{ applicationId: 'application-b', error: 'Review could not be saved' }] }))
      .mockResolvedValueOnce(Response.json({ processedCount: 1, failedCount: 0, failures: [] }));
    render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    confirmBulkInfo();
    await screen.findByText('Ask for info: 1 done, 1 failed.');
    expect(screen.getByRole('checkbox', { name: 'Select Applicant a' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Ask for info (1)' })).toBeInTheDocument();
    confirmBulkInfo();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    expect(requestBody(1).applicationIds).toEqual(['application-b']);
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).not.toBeChecked();
  });

  it.each([408, 500, 502, 504])('requires a fresh queue after an ambiguous HTTP %s response', async (status) => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Internal server error' }, { status }));
    const { rerender } = render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    confirmBulkInfo();
    expect(await screen.findByRole('alert')).toHaveTextContent('some items may have completed');
    expect(screen.getByRole('button', { name: 'Confirm bulk review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bulk review' }));
    expect(mocks.fetch).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel bulk review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask for info (2)' }));
    expect(screen.getByRole('button', { name: 'Confirm bulk review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload queue' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    // Reload request alone does not unlock a retry until fresh server data arrives.
    fireEvent.click(screen.getByRole('button', { name: 'Ask for info (2)' }));
    expect(screen.getByRole('button', { name: 'Confirm bulk review' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel bulk review' }));
    rerender(<AdminCommandCenterClient data={center({ applicationsPending: [application('b')] })} />);
    mocks.fetch.mockResolvedValueOnce(Response.json({ processedCount: 1, failedCount: 0, failures: [] }));
    confirmBulkInfo();
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(requestBody(1).applicationIds).toEqual(['application-b']);
  });

  it.each([
    { label: 'an empty object', body: '{}' },
    { label: 'unparseable JSON', body: 'upstream returned no review receipt' },
    { label: 'an inconsistent processed count', body: JSON.stringify({ processedCount: 2, failedCount: 1, failures: [{ applicationId: 'application-b' }] }) },
    { label: 'a missing failed-ID receipt', body: JSON.stringify({ processedCount: 1, failedCount: 1, failures: [] }) },
    { label: 'a failed ID outside the submitted page', body: JSON.stringify({ processedCount: 1, failedCount: 1, failures: [{ applicationId: 'application-not-selected' }] }) },
    { label: 'duplicate failed IDs', body: JSON.stringify({ processedCount: 0, failedCount: 2, failures: [{ applicationId: 'application-b' }, { applicationId: 'application-b' }] }) },
  ])('treats HTTP 200 with $label as uncertain and preserves both selected rows', async ({ body }) => {
    mocks.fetch.mockResolvedValueOnce(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select this page' }));
    confirmBulkInfo();
    expect(await screen.findByRole('alert')).toHaveTextContent('The review response could not be confirmed.');
    expect(screen.getByRole('checkbox', { name: 'Select Applicant a' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).toBeChecked();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('retains selected rows and server error when the request is rejected', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Your permissions changed. Reload the queue.' }, { status: 403 }));
    render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Applicant b' }));
    confirmBulkInfo();
    expect(await screen.findByRole('alert')).toHaveTextContent('Your permissions changed. Reload the queue.');
    expect(screen.getByRole('checkbox', { name: 'Select Applicant b' })).toBeChecked();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('requires an explicit eligibility attestation before a bulk approval request', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ processedCount: 1, failedCount: 0, failures: [] }));
    render(<AdminCommandCenterClient data={center()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Applicant a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bulk review' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Check the box confirming you reviewed eligibility before approving.');
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I reviewed eligibility for these applicants before approving.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bulk review' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(requestBody()).toMatchObject({ applicationIds: ['application-a'], status: 'APPROVED', verified: true });
  });
});

describe('admin system-health evidence', () => {
  it('labels an unverified health check as unknown instead of displaying a healthy result', () => {
    render(<CommandCenterKit dateLabel="Sep 9, 2026" kpis={[]} queueItems={[]} programHealth={[]} placementsByMonth={[]}
      systemHealth={[{ name: 'Email delivery', status: 'unknown', meta: 'Provider delivery has not been verified.' }]} />);
    expect(screen.getByText('Email delivery')).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.getByText('Provider delivery has not been verified.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email delivery not verified')).toBeInTheDocument();
    expect(screen.queryByText('OK', { exact: true })).not.toBeInTheDocument();
  });
});
