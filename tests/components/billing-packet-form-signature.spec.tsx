import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@/messages/en.json';
import BillingPacketClient from '@/app/admin/members/[id]/billing/BillingPacketClient';

afterEach(cleanup);

describe('Billing packet signer', () => {
  it('requires a new signature acknowledgment when the signer name changes', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Chicago">
        <BillingPacketClient
          memberId="member-1"
          memberName="Sample Member"
          memberEmail="member@example.test"
          programs={[{
            slug: 'test-program',
            title: 'Test Program',
            lineItems: [{ description: 'Test course', hours: 10, amount: 100 }],
            pricingSource: 'organization_catalog',
            priceListMaximum: null,
            isPrimary: true,
            unavailableReason: null,
          }]}
          billTo={{ name: 'Test Board', attention: 'Accounts Payable', address: '' }}
          signer={{ name: 'Test Signer', title: 'Director' }}
          providerName="Test Provider"
          counselorLabel={null}
          initialPackets={[]}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Type name instead' }));
    const acknowledgment = screen.getByRole('checkbox', { name: /I, Test Signer, am signing these documents/ });
    fireEvent.click(acknowledgment);
    expect(acknowledgment).toBeChecked();

    fireEvent.change(screen.getByLabelText('Signer name'), { target: { value: 'Different Signer' } });
    expect(screen.getByRole('checkbox', { name: /I, Different Signer, am signing these documents/ })).not.toBeChecked();
  });
});
