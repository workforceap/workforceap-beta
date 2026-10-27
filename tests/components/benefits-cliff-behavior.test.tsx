import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BenefitsCliffClient from '@/components/portal/BenefitsCliffClient';
import messages from '@/messages/en.json';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('benefits calculator local offer behavior', () => {
  it('requires a positive offer and selected benefit, keeps the estimate disclaimer, and makes no request', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<NextIntlClientProvider locale="en" messages={messages}><BenefitsCliffClient /></NextIntlClientProvider>);
    const calculate = screen.getByRole('button', { name: messages.benefitsCliff.computeCta });
    const wage = screen.getByLabelText(messages.benefitsCliff.offerWageLabel);
    const hours = screen.getByLabelText(messages.benefitsCliff.offerHoursLabel);
    expect(screen.getByText(messages.benefitsCliff.disclaimerTitle)).toBeVisible();
    expect(calculate).toBeDisabled();
    for (const invalid of ['0', '-1', '']) {
      fireEvent.change(wage, { target: { value: invalid } });
      expect(calculate).toBeDisabled();
    }
    fireEvent.change(wage, { target: { value: '20' } });
    expect(calculate).toBeEnabled();
    fireEvent.click(calculate);
    expect(screen.getByText(messages.benefitsCliff.disclaimerTitle)).toBeVisible();
    expect(screen.getByText(messages.benefitsCliff.verdictBetter)).toBeVisible();
    fireEvent.change(hours, { target: { value: '0' } });
    expect(calculate).toBeDisabled();
    expect(screen.queryByText(messages.benefitsCliff.verdictBetter)).toBeNull();
    fireEvent.change(hours, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('checkbox', { name: messages.benefitsCliff.programSnap }));
    expect(calculate).toBeDisabled();
    expect(screen.getByText(messages.benefitsCliff.pickOneProgram)).toBeVisible();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
