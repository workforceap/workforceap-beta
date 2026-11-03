import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import BenefitsCliffClient from '@/components/portal/BenefitsCliffClient';
import messages from '@/messages/en.json';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('requires valid offer inputs, preserves the estimate disclaimer, and never sends a request', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<NextIntlClientProvider locale="en" messages={messages}><BenefitsCliffClient /></NextIntlClientProvider>);
  expect(screen.getByText(messages.benefitsCliff.disclaimerTitle)).toBeVisible();
  const calculate = screen.getByRole('button');
  expect(calculate).toBeDisabled();
  fireEvent.change(screen.getByLabelText(messages.benefitsCliff.offerWageLabel), { target: { value: '20' } });
  expect(calculate).toBeEnabled();
  fireEvent.click(calculate);
  expect(screen.getByText(messages.benefitsCliff.disclaimerTitle)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(messages.benefitsCliff.offerHoursLabel), { target: { value: '0' } });
  expect(calculate).toBeDisabled();
});
