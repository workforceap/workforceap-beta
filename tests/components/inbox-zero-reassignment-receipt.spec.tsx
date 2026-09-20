import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxZeroQueue } from '@/lib/counselor/inboxZero';
import { emptyReasonCounts } from '@/lib/attention/reasons';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fetchWithTimeout', () => ({ fetchWithTimeout: request }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => {
  if (key === 'inboxZeroBulkResult') return `Completed: ${values?.sent}; failed: ${values?.failed}`;
  return key;
} }));
import InboxZeroClient from '@/components/portal/counselor/InboxZeroClient';

const queue: InboxZeroQueue = {
  rows: [{ memberId: 'member-1', memberName: 'Synthetic Member', memberEmail: 'synthetic@example.invalid',
    enrolledProgram: null, primaryFlag: 'no_counselor_contact_7d', additionalFlags: [], priorityRank: 1, severity: 8,
    context: { daysSinceLastContact: 8 } }],
  totals: { total: 1, dismissedToday: 0, byFlag: { ...emptyReasonCounts(), no_counselor_contact_7d: 1 } },
};
const emptyQueue: InboxZeroQueue = { rows: [], totals: { ...queue.totals, total: 0, byFlag: emptyReasonCounts() } };
const warning = 'Counselor assigned, but audit history needs review. Contact an administrator; do not repeat the reassignment.';
function setupReceipt(receipt: object, refreshFails = false) {
  request.mockImplementation(async (url: string) => {
    if (url === '/api/counselor/counselors') return Response.json({ counselors: [{ userId: 'counselor-new', fullName: 'New Counselor' }] });
    if (url === '/api/counselor/inbox-zero/bulk') return Response.json(receipt);
    if (refreshFails) return Response.json({ error: 'Synthetic queue refresh failure' }, { status: 503 });
    return Response.json({ queue: emptyQueue });
  });
}
async function reassign() {
  render(<InboxZeroClient initialQueue={queue} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'inboxZeroSelectAll' }));
  await screen.findByRole('option', { name: 'New Counselor' });
  fireEvent.change(screen.getByRole('combobox', { name: 'inboxZeroBulkReassignLabel' }), { target: { value: 'counselor-new' } });
  fireEvent.click(screen.getByRole('button', { name: 'inboxZeroBulkReassign' }));
}
beforeEach(() => request.mockReset());

describe('counselor reassignment receipts', () => {
  it('keeps the committed result and audit warning visible when reassignment empties the queue', async () => {
    setupReceipt({ ok: true, sent: 1, failed: 0, warnings: [warning] });
    await reassign();
    expect(await screen.findByRole('status')).toHaveTextContent('Completed: 1; failed: 0');
    expect(await screen.findByRole('alert')).toHaveTextContent(warning);
    expect(await screen.findByText('inboxZeroClearTitle')).toBeInTheDocument();
    expect(screen.queryByText('inboxZeroBulkFailed')).not.toBeInTheDocument();
    const calls = request.mock.calls.filter(([url]) => url === '/api/counselor/inbox-zero/bulk');
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body)).toEqual({ action: 'reassign', memberIds: ['member-1'], counselorUserId: 'counselor-new' });
  });

  it('preserves the received result after queue refresh failure and does not label reassignment failed', async () => {
    setupReceipt({ ok: true, sent: 1, failed: 0, warnings: [warning] }, true);
    await reassign();
    expect(await screen.findByRole('status')).toHaveTextContent('Completed: 1; failed: 0');
    expect(await screen.findByText('The queue could not refresh. Reload this page before taking another action.')).toBeInTheDocument();
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.queryByText('inboxZeroBulkFailed')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'inboxZeroSelectAll' })).not.toBeChecked());
  });

  it('does not invent audit warnings when the committed receipt has none', async () => {
    setupReceipt({ ok: true, sent: 1, failed: 0, warnings: [] });
    await reassign();
    expect(await screen.findByRole('status')).toHaveTextContent('Completed: 1; failed: 0');
    expect(await screen.findByText('inboxZeroClearTitle')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
