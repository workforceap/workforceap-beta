/**
 * Admin packet list states: a packet with no valid signed snapshot cannot be
 * emailed (Supersede stays available); a reconciliation shows its own result,
 * never "Sent to ."; partial delivery offers "Send to remaining recipients"
 * and shows the per-recipient history. Synthetic data only.
 */
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import BillingPacketList from '@/components/billing/BillingPacketList';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';

const fetchMock = vi.fn<typeof fetch>();

function withMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">
      {ui}
    </NextIntlClientProvider>,
  );
}

type SendState = NonNullable<BillingPacketSummary['sendState']>;
function packet(over: Partial<BillingPacketSummary> = {}, sendState: Partial<SendState> | null = null): BillingPacketSummary {
  return {
    id: 'packet-1', packetNumber: 'WAP-TEST-0001', status: 'signed', programSlug: 'fixture', programTitle: 'Fixture program',
    invoiceDate: '2026-09-01', dueDate: null, billToName: 'Fixture Board', referenceNumber: null, totalAmount: 1250, lineItems: [],
    signerName: 'Sam Signer', signerTitle: 'Director', signedAt: '2026-09-01T00:00:00.000Z', sentAt: null, sentTo: [], sendCount: 0,
    recipients: { student: 'student@example.test', counselor: 'Casey (casey@example.test)' },
    supersededAt: null, supersededReason: null, supersededById: null, supersededByPacketId: null, supersedesPacketId: null, sendBlockedReason: null,
    sendState: sendState
      ? { attemptNo: 1, attemptRecipients: ['student', 'counselor'], nextAction: 'send', rows: [], delivered: [], remaining: [], history: [], warnings: [], ...sendState }
      : null,
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BillingPacketList admin states', () => {
  it('a legacy or corrupt packet: send disabled, re-issue copy, no recipient line, Supersede available', () => {
    const onSupersede = vi.fn();
    withMessages(<BillingPacketList packets={[packet({ sendBlockedReason: 'snapshot_corrupt', recipients: null })]} canSend onSupersede={onSupersede} memberEmail="live@example.test" />);
    expect(screen.getByRole('button', { name: 'Email to counselor and student' })).toBeDisabled();
    expect(screen.getByText(/Re-issue required: this packet has no valid signed snapshot/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Goes to/);
    expect(document.body.textContent).not.toContain('live@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Supersede and re-issue' }));
    expect(onSupersede).toHaveBeenCalled();
  });

  it('a recorded reconciliation shows "Reconciliation recorded", not "Sent to ."', async () => {
    const p = packet({}, { nextAction: 'reconcile', rows: [{ recipient: 'student', status: 'needs_reconciliation', lastError: 'x' }] });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, kind: 'reconciliation_recorded', outcome: 'not_delivered', recipient: 'student', packet: p }), { status: 200 }),
    );
    withMessages(<BillingPacketList packets={[p]} canSend />);
    fireEvent.change(screen.getByLabelText('What you checked for the student copy'), { target: { value: 'No entry in the Resend log' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm not delivered' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Reconciliation recorded — Student copy: not delivered.');
    expect(status.textContent).not.toMatch(/Sent to/);
  });

  it('partial delivery: history stays visible and "Send to remaining recipients" is offered; the full resend asks for confirmation', async () => {
    const p = packet({}, {
      nextAction: 'email_again',
      delivered: [{ recipient: 'student', email: 'student@example.test', at: '2026-09-02T15:00:00.000Z', attemptNo: 1 }],
      remaining: ['counselor'],
      history: [
        { attemptNo: 1, recipient: 'student', email: 'student@example.test', status: 'sent', claimedAt: '2026-09-02T15:00:00.000Z', sentAt: '2026-09-02T15:00:00.000Z', lastError: null, reconciledAt: null, reconciledBy: null, reconcileNote: null },
        { attemptNo: 1, recipient: 'counselor', email: 'casey@example.test', status: 'rejected_definite', claimedAt: '2026-09-02T15:00:00.000Z', sentAt: null, lastError: 'Invalid to', reconciledAt: null, reconciledBy: null, reconcileNote: null },
      ],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    withMessages(<BillingPacketList packets={[p]} canSend />);
    expect(screen.getByText(/Attempt 1, student \(student@example.test\): delivered to the provider/)).toBeInTheDocument();
    expect(screen.getByText(/Attempt 1, counselor \(casey@example.test\): rejected \(not sent\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to remaining recipients (counselor)' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Email again to everyone (duplicate copy)' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('the student (student@example.test) on September 2, 2026, attempt 1'));
    expect(fetchMock).not.toHaveBeenCalled(); // declined
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, kind: 'sent', packet: p, sentTo: ['casey@example.test'] }), { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to remaining recipients (counselor)' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to casey@example.test.');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ action: 'send_remaining' });
  });
});
