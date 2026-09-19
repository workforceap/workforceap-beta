import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

const api = vi.hoisted(() => ({ fetchAuth: vi.fn() }));
vi.mock('@/lib/fetchWithTimeout', () => api);
vi.mock('next/navigation', () => ({ usePathname: () => '/en/verify-mfa' }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn(), trackMemberLoggedIn: vi.fn() }));
import VerifyMfaPage from '@/app/(auth)/verify-mfa/page';

function mount() {
  return render(<NextIntlClientProvider locale="en" messages={en} timeZone="America/New_York"><VerifyMfaPage /></NextIntlClientProvider>);
}
beforeEach(() => { api.fetchAuth.mockReset(); api.fetchAuth.mockResolvedValueOnce(Response.json({ mfaRequired: true })); });
afterEach(cleanup);

describe('MFA control presentation preserves the verification contract', () => {
  it('focuses the numeric code and enables only a complete six-digit code', () => {
    const { container } = mount();
    const code = screen.getByLabelText(en.auth.mfaVerify.codeLabel);
    const button = screen.getByRole('button', { name: en.auth.mfaVerify.verifyButton });
    expect(code).toHaveFocus();
    expect(button).toBeDisabled();
    expect(code).toHaveAttribute('autoComplete', 'one-time-code');
    fireEvent.change(code, { target: { value: '12ab345' } });
    expect(code).toHaveValue('12345');
    expect(button).toBeDisabled();
    fireEvent.change(code, { target: { value: '123456' } });
    expect(button).toBeEnabled();
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('preserves the chosen trust-device value and disables submission while pending', async () => {
    api.fetchAuth.mockImplementationOnce(() => new Promise(() => {}));
    mount();
    fireEvent.change(screen.getByLabelText(en.auth.mfaVerify.codeLabel), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: en.auth.mfaVerify.verifyButton }));
    await waitFor(() => expect(api.fetchAuth).toHaveBeenCalledTimes(2));
    expect(JSON.parse(api.fetchAuth.mock.calls[1][1].body)).toEqual({ code: '123456', trustDevice: false });
    expect(screen.getByRole('button', { name: en.auth.mfaVerify.verifying })).toBeDisabled();
    expect(screen.getByRole('button', { name: en.auth.mfaVerify.verifying })).toHaveAttribute('aria-busy', 'true');
  });

  it('announces rejected verification and restores the code focus without clearing it', async () => {
    api.fetchAuth.mockResolvedValueOnce(Response.json({ error: 'Fixture code rejected' }, { status: 400 }));
    mount();
    const code = screen.getByLabelText(en.auth.mfaVerify.codeLabel);
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: en.auth.mfaVerify.verifyButton }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Fixture code rejected'));
    expect(code).toHaveFocus();
    expect(code).toHaveValue('123456');
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: en.auth.mfaVerify.verifyButton })).toBeEnabled();
  });
});
