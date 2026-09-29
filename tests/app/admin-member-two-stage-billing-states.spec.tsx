import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import TwoStageBillingWorkbench from '@/app/admin/members/[id]/billing/TwoStageBillingWorkbench';
import type { CaseSummaryDto, RecipientRole } from '@/lib/billing/twoStage/dto';
import { GATE_TEXT, emptyCaseSummary, j5Draft, j5DraftSummary, waitingOnMichaelSummary } from '../fixtures/billing/twoStageSummary';

const shell = { memberName: 'Sam Student', memberEmail: 'sam.student@example.test', counselor: { name: 'Assigned Counselor', email: 'assigned.counselor@example.test' } };

function renderSummary(summary: CaseSummaryDto, extra: Partial<Parameters<typeof TwoStageBillingWorkbench>[0]> = {}) {
  return render(
    <TwoStageBillingWorkbench
      {...shell}
      caseInfo={summary.case}
      gates={summary.gates}
      viewer={summary.viewer}
      readinessByStage={summary.readinessByStage}
      readinessWaitingOn={summary.readinessWaitingOn}
      waitingOnDesignatedSigner={summary.waitingOnDesignatedSigner}
      j5={summary.j5}
      j6={summary.j6}
      onPrepareJ5={() => undefined}
      onPrepareJ6={() => undefined}
      {...extra}
    />,
  );
}

const card = (stage: 'j5' | 'j6') => screen.getByRole('region', { name: stage === 'j5' ? 'Quote / Voucher Request' : 'Invoice / Voucher Cover Letter' });
const row = (stage: 'j5' | 'j6', label: string) => within(card(stage)).getByText(label).closest('li') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('two-stage billing workbench states (M4)', () => {
  it('empty case: gates, per-stage blockers and contacts come from the summary', () => {
    renderSummary(emptyCaseSummary());

    const gates = screen.getByRole('region', { name: 'Release gates' });
    expect(within(gates).getByText(GATE_TEXT.signing)).toBeInTheDocument();
    expect(within(gates).getByText(GATE_TEXT.email)).toBeInTheDocument();
    // The summary never checks Storage: the archive gate is unknown, never "closed".
    expect(within(gates).getByText('Finance archive').closest('li')).toHaveAttribute('data-enabled', 'null');

    expect(within(card('j5')).getByText('Record the J5 readiness attestation (with the confirmed class start date) first.')).toBeInTheDocument();
    expect(within(card('j6')).getByText('A sent J5 quote or an approved external quote must be on file first.')).toBeInTheDocument();
    expect(screen.getByText(/Contacts on file:/).closest('p')).toHaveTextContent('Counselor Assigned Counselor (assigned counselor)');
    expect(screen.getByText(/Contacts on file:/).closest('p')).toHaveTextContent('phone not on file');
    expect(screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' })).toBeEnabled();
    expect(screen.getAllByText('No draft saved yet.')).toHaveLength(2);
  });

  it('shows each stage its own readiness (no J5 fact on the J6 card)', () => {
    const summary = emptyCaseSummary({
      readinessByStage: { j5: { boardConfirmed: true, programAndClassDatesConfirmed: true }, j6: { programAndClassDatesConfirmed: false } },
    });
    renderSummary(summary);
    expect(row('j5', 'Workforce Solutions board confirmed')).toHaveAttribute('data-status', 'verified');
    expect(row('j6', 'Workforce Solutions board confirmed')).toHaveAttribute('data-status', 'unchecked');
    expect(within(card('j5')).getByText('Approved class, hours, and class dates confirmed').closest('li')).toHaveAttribute('data-status', 'verified');
    expect(within(card('j6')).getByText('Approved class, hours, and class dates confirmed').closest('li')).toHaveAttribute('data-status', 'attention');
  });

  it('labels the prior-quote row by what the server checks', () => {
    renderSummary(emptyCaseSummary());
    expect(within(card('j6')).getByText('J5 quote sent, or approved external quote on file')).toBeInTheDocument();
    expect(screen.queryByText(/J5 quote or approved external quote is on file/)).toBeNull();
  });

  it('no longer asks staff to confirm the approved WAP letterhead', () => {
    renderSummary(emptyCaseSummary());
    expect(screen.queryByText(/Confirm the WAP letterhead/)).toBeNull();
    expect(screen.getAllByText(/must authenticate and explicitly sign this stage/)).toHaveLength(2);
  });

  it('waiting on Michael: staff see his steps and cannot act on them', () => {
    const action = vi.fn(() => <button type="button">Michael action</button>);
    renderSummary(waitingOnMichaelSummary(false), { renderSignerTaskAction: action });

    for (const label of [
      'Voucher / PO reference and received date verified',
      'Michael’s receiving signature on the voucher explicitly attested',
      'Voucher matches the approved class, dates, and $7,500 tuition',
    ]) {
      const r = row('j6', label);
      expect(r).toHaveAttribute('data-status', 'waiting');
      expect(r).toHaveTextContent('Waiting on Michael A. Brown');
    }
    // The server hashes the upload: this row never waits on him.
    expect(row('j6', 'Original signed voucher uploaded with uploader and file hash recorded')).toHaveAttribute('data-status', 'verified');

    const tasks = screen.getByLabelText('Waiting on Michael A. Brown');
    expect(within(tasks).getByText(/Only Michael A. Brown, signed in as himself, can complete these steps/)).toBeInTheDocument();
    expect(within(tasks).getByText(/record the voucher details/)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Michael action' })).toBeNull();
    // The blockers carry the same tag.
    const blocker = within(card('j6')).getAllByText(/record the voucher details/).find((el) => el.closest('[data-code="J6_VOUCHER_ATTESTATION_INCOMPLETE"]'));
    expect(blocker?.closest('li')).toHaveTextContent('Waiting on Michael A. Brown');
  });

  it('waiting on Michael: offers only the ready step to the designated signer', () => {
    const action = vi.fn((task: { step: string }) => <button type="button">{`Do ${task.step}`}</button>);
    renderSummary(waitingOnMichaelSummary(true), { renderSignerTaskAction: action });
    expect(screen.getByText('You are signed in as the designated signer. These steps are yours.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do voucher_data' })).toBeInTheDocument();
    // The receipt step is not ready until the voucher data exists.
    expect(screen.queryByRole('button', { name: 'Do voucher_receipt_signature' })).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('renders hard holds distinctly with the voucher mismatch', () => {
    const summary = waitingOnMichaelSummary(false);
    summary.j6 = {
      ...summary.j6,
      holds: ['voucher_amount_differs'],
      matches: [
        { check: 'amount', result: 'mismatch', expected: '$7,500.00', actual: '$7,000.00', reasonCode: 'voucher_amount_differs', hardHold: true },
        { check: 'program', result: 'ok', expected: 'x', actual: 'x', reasonCode: 'voucher_class_differs', hardHold: true },
      ],
      blockers: [{ code: 'HOLD_VOUCHER_AMOUNT_DIFFERS', message: 'The voucher amount is not $7,500.00.', hardHold: true }, ...summary.j6.blockers],
    };
    renderSummary(summary);
    const hold = within(card('j6')).getByText('The voucher amount is not $7,500.00.').closest('li') as HTMLElement;
    expect(hold).toHaveAttribute('data-hard-hold', 'true');
    expect(within(hold).getByText('Hold')).toBeInTheDocument();
    const holds = screen.getByRole('group', { name: 'J6 holds' });
    expect(within(holds).getByText('Expected $7,500.00; voucher shows $7,000.00')).toBeInTheDocument();
    expect(within(holds).queryByText('Program')).toBeNull();
  });

  it('lists recipients from the saved version, including a role the UI has never seen', () => {
    const summary = j5DraftSummary();
    const extraRole = 'dad' as RecipientRole; // a role added in M1/M3 later
    summary.j5 = {
      ...summary.j5,
      current: j5Draft({ recipients: [...j5Draft().recipients, { role: extraRole, name: 'Internal Copy', email: 'internal.copy@example.test', phone: null }] }),
    };
    renderSummary(summary);
    const list = screen.getByRole('list', { name: 'J5 recipients' });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('data-role'))).toEqual(['counselor', 'student', 'dad']);
    expect(within(list).getByText('Dad')).toBeInTheDocument();
    expect(within(list).getByText(/Casey Counselor · casey.counselor@example.test · \(512\) 555-0100/)).toBeInTheDocument();
    expect(within(card('j5')).getByText('Counselor, student, and dad')).toBeInTheDocument();
  });

  it('shows the saved draft on its card and switches the button to editing', () => {
    renderSummary(j5DraftSummary());
    expect(within(card('j5')).getByText(/v1 · WAP-Q-2026-0001/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit J5 Quote / Voucher Request draft' })).toBeEnabled();
  });

  it('keeps disabled buttons shaped like buttons, with the gate reason', () => {
    render(<TwoStageBillingWorkbench {...shell} unavailableReason="J5/J6 billing is not available in this environment yet (its database migration is not applied)." />);
    const j5 = screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' });
    expect(j5).toBeDisabled();
    expect(j5.className).toMatch(/primaryButton/);
    expect(j5).toHaveAccessibleDescription('J5/J6 billing is not available in this environment yet (its database migration is not applied).');
  });
});
