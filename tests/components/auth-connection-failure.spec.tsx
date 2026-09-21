import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

const navigation = vi.hoisted(() => ({
  search: new URLSearchParams(),
  push: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/login',
  useSearchParams: () => navigation.search,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, fill: _fill, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => <img alt={alt} {...props} />,
}));
vi.mock('@/lib/auth/client', () => ({ createSupabaseBrowserClient: () => ({ auth }) }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));

import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import SetupMfaPage from '@/app/(auth)/setup-mfa/page';

const fetchMock = vi.fn<typeof fetch>();
const connectionCopy = messages.common.connectionError;
const forgotConnectionCopy = messages.auth.forgotPassword.networkError;

function mount(ui: ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">{ui}</NextIntlClientProvider>);
}

function htmlErrorPage() {
  // A proxy or the platform answering a JSON endpoint with an HTML page.
  return new Response('<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  navigation.search = new URLSearchParams();
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  window.history.replaceState(null, '', '/en/reset-password');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('auth forms after a request fails before the app gets a usable answer', () => {
  it('setup-mfa: a dropped connection reads as the connection copy, not "Failed to fetch"', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mount(<SetupMfaPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(connectionCopy);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
  });

  it('setup-mfa: an HTML error page parsed as JSON reads as the connection copy, not "Unexpected token"', async () => {
    fetchMock.mockResolvedValueOnce(htmlErrorPage());
    mount(<SetupMfaPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(connectionCopy);
    expect(alert).not.toHaveTextContent(/Unexpected token|JSON/);
  });

  it('setup-mfa: a message the server raised on purpose still reaches the member', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'MFA is already enabled for this account.' }, { status: 409 }));
    mount(<SetupMfaPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('MFA is already enabled for this account.');
  });

  it('forgot-password: an HTML error page parsed as JSON reads as the connection copy and stays retryable', async () => {
    fetchMock.mockResolvedValueOnce(htmlErrorPage());
    mount(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'learner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forgotConnectionCopy);
    expect(alert).not.toHaveTextContent(/Unexpected token|JSON|Failed to fetch/);
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  });

  it('forgot-password: a dropped connection reads as the connection copy', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    mount(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'learner@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(forgotConnectionCopy);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
  });

  async function submitNewPassword() {
    navigation.search.set('token_hash', 'valid-token');
    navigation.search.set('type', 'recovery');
    mount(<ResetPasswordPage />);
    await screen.findByRole('heading', { name: 'Set new password' });
    fireEvent.change(screen.getByLabelText(/New password \*/), { target: { value: 'New-example-123' } });
    fireEvent.change(screen.getByLabelText(/Confirm new password/), { target: { value: 'New-example-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    return screen.findByRole('alert');
  }

  it('reset-password: a supabase-js dropped connection reads as the connection copy, not "Failed to fetch"', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });
    const alert = await submitNewPassword();
    expect(alert).toHaveTextContent(connectionCopy);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeEnabled();
    expect(screen.getByLabelText(/New password \*/)).toHaveValue('New-example-123');
  });

  it('reset-password: a non-JSON provider answer reads as the connection copy, not "Unexpected token"', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { name: 'AuthUnknownError', message: "Unexpected token '<', \"<!doctype \"... is not valid JSON", status: undefined } });
    const alert = await submitNewPassword();
    expect(alert).toHaveTextContent(connectionCopy);
    expect(alert).not.toHaveTextContent(/Unexpected token/);
  });

  it('reset-password: provider validation copy still reaches the member', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { name: 'AuthApiError', code: 'same_password', message: 'New password should be different from the old password.', status: 422 } });
    expect(await submitNewPassword()).toHaveTextContent('New password should be different from the old password.');
  });

  it('reset-password: a weak-password refusal reads as clear sentence-case guidance, not the provider phrasing (WAP-26)', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { name: 'AuthWeakPasswordError', code: 'weak_password', message: 'Password should contain at least one number.', status: 422 } });
    const alert = await submitNewPassword();
    expect(alert).toHaveTextContent(messages.auth.resetPassword.weakPassword);
    expect(alert).toHaveTextContent('Choose a stronger password: at least 8 characters, not a commonly used password.');
    expect(alert).not.toHaveTextContent(/should contain at least one number/);
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeEnabled();
  });
});
