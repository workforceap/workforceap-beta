import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import BillingPacketClient from '@/app/admin/members/[id]/billing/BillingPacketClient';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Billing packet signer', () => {
  it('discards the drawn canvas when the signer name changes', () => {
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
    const firstCanvas = screen.getByRole('img', { name: /Signature drawing area/ }) as HTMLCanvasElement;
    Object.defineProperty(firstCanvas, 'setPointerCapture', { value: () => undefined });
    vi.spyOn(firstCanvas, 'getContext').mockReturnValue({ beginPath() {}, arc() {}, fill() {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(firstCanvas, 'toDataURL').mockReturnValue('data:image/png;base64,ZmFrZQ==');
    fireEvent.pointerDown(firstCanvas, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(firstCanvas, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(screen.getByText('Signature captured.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Signer name'), { target: { value: 'Different Signer' } });
    const nextCanvas = screen.getByRole('img', { name: /Signature drawing area/ });
    expect(nextCanvas).not.toBe(firstCanvas);
    expect(screen.getByText('Sign above the line, then release to capture.')).toBeInTheDocument();
  });

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
