import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TwoStageBillingWorkbench, {
  type TwoStageBillingReadiness,
} from '@/app/admin/members/[id]/billing/TwoStageBillingWorkbench';

const contacts = {
  memberName: 'Case Student',
  memberEmail: 'student@example.test',
  counselor: { name: 'Case Counselor', email: 'counselor@example.test' },
};

const j5Ready: TwoStageBillingReadiness = {
  studentApprovedAndReady: true,
  counselorRequestedQuote: true,
  boardConfirmed: true,
  counselorContactVerified: true,
  studentEmailVerified: true,
  programAndClassDatesConfirmed: true,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('two-stage member billing workbench', () => {
  it('shows two distinct guarded actions, recipient sets, and retained-file requirements', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<TwoStageBillingWorkbench {...contacts} />);

    const j5 = screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' });
    const j6 = screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' });
    expect(j5).toBeDisabled();
    expect(j6).toBeDisabled();
    expect(screen.getByText('Counselor and student')).toBeInTheDocument();
    expect(screen.getByText('Board finance person, counselor, and student')).toBeInTheDocument();
    expect(screen.getByText('Signed WAP cover letter + original signed board voucher')).toBeInTheDocument();
    expect(screen.getByText('Tuition & Fees · $7,500.00')).toBeInTheDocument();
    expect(screen.getByText(/10–14 days/)).toBeInTheDocument();
    expect(screen.getAllByText('Preparation is not yet available. The secure billing workflow is being connected.')).toHaveLength(2);

    fireEvent.click(j5);
    fireEvent.click(j6);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows J5 draft preparation before a voucher exists when its own facts are verified', () => {
    const prepareJ5 = vi.fn();
    const prepareJ6 = vi.fn();
    render(
      <TwoStageBillingWorkbench
        {...contacts}
        readiness={{ ...j5Ready, signedVoucherArchived: false, classStarted: false, financeContactVerified: false }}
        onPrepareJ5={prepareJ5}
        onPrepareJ6={prepareJ6}
      />,
    );

    const j5 = screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' });
    const j6 = screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' });
    expect(j5).toBeEnabled();
    expect(j6).toBeDisabled();
    fireEvent.click(j5);
    fireEvent.click(j6);
    expect(prepareJ5).toHaveBeenCalledOnce();
    expect(prepareJ6).not.toHaveBeenCalled();
    expect(screen.getByText('A board voucher is not required to prepare J5.')).toBeInTheDocument();
  });

  it('holds J6 until both a signed voucher and class start are verified', () => {
    const prepareJ6 = vi.fn();
    const ready = { ...j5Ready, signedVoucherArchived: true, classStarted: true, financeContactVerified: true };
    const { rerender } = render(
      <TwoStageBillingWorkbench {...contacts} readiness={{ ...ready, signedVoucherArchived: false }} onPrepareJ6={prepareJ6} />,
    );
    const j6 = screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' });
    expect(j6).toBeDisabled();

    rerender(<TwoStageBillingWorkbench {...contacts} readiness={{ ...ready, classStarted: false }} onPrepareJ6={prepareJ6} />);
    expect(j6).toBeDisabled();

    rerender(<TwoStageBillingWorkbench {...contacts} readiness={ready} onPrepareJ6={prepareJ6} />);
    expect(j6).toBeEnabled();
    fireEvent.click(j6);
    expect(prepareJ6).toHaveBeenCalledOnce();
    expect(screen.getByText('Michael’s receiving signature on the original voucher verified and archived')).toBeInTheDocument();
  });

  it('never exposes an action solely because the checks pass when no route is connected', () => {
    render(
      <TwoStageBillingWorkbench
        {...contacts}
        readiness={{ ...j5Ready, signedVoucherArchived: true, classStarted: true, financeContactVerified: true }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create J5 Quote / Voucher Request' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create J6 Invoice / Voucher Cover Letter' })).toBeDisabled();
    expect(screen.getAllByText('Preparation is not yet available. The secure billing workflow is being connected.')).toHaveLength(2);
  });
});
