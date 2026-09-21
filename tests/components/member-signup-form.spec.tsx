import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

vi.hoisted(() => { vi.stubEnv('NEXT_PUBLIC_CAPTCHA_ENABLED', 'false'); });

vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/en/signup' }));
// CAPTCHA is disabled for these tests; never load its third-party widget.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import SignupForm from '@/app/(auth)/signup/SignupForm';

const fetchMock = vi.fn<typeof fetch>();
const PROGRAM_INTEREST = 'Digital Literacy Empowerment Class (6 weeks, 30 hours total)';

function renderSignup() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      <SignupForm initialRedirectTo="/dashboard/training?tab=courses" />
    </NextIntlClientProvider>,
  );
}

function fillRequiredFields({ consentTerms = true } = {}) {
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Test User' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Test@Example.com' } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Password1' } });
  fireEvent.change(screen.getByLabelText('Program of Interest'), { target: { value: PROGRAM_INTEREST } });
  if (consentTerms) fireEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => {
  fetchMock.mockReset();
  // Stub the transport, retaining the real form, resolver, and fetchAuth wrapper.
  // No test here creates an account or proves database/email persistence.
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
  window.dataLayer = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  delete window.dataLayer;
});

afterAll(() => { vi.unstubAllEnvs(); });

describe('member signup form response contract (mocked transport)', () => {
  it('posts valid required fields without phone/ZIP and only shows verification after the response', async () => {
    let resolveResponse!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    renderSignup();
    fillRequiredFields();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/member/signup');
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(options!.body as string)).toEqual({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'Password1',
      programInterest: PROGRAM_INTEREST,
      employmentStatus: '',
      veteranStatus: '',
      consentTerms: true,
      consentCommunications: false,
    });
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();

    resolveResponse(Response.json({ success: true, message: 'Check your email to verify your account.' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText(/sent you a verification link/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute(
      'href', '/en/login?redirectTo=%2Fdashboard%2Ftraining%3Ftab%3Dcourses',
    );
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [400, 'An account with this email may already exist.'],
    [500, 'Account creation failed. Please try again.'],
  ])('shows the API error for HTTP %s without claiming success', async (status, error) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error }, { status }));
    renderSignup();
    fillRequiredFields();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toHaveValue('Test@Example.com');
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to login' })).not.toBeInTheDocument();
  });

  it('shows the localised weak-password guidance when the API reports reason weak_password (WAP-26)', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'provider text the form must not echo', reason: 'weak_password' }, { status: 400 }));
    renderSignup();
    fillRequiredFields();
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.auth.signup.weakPassword);
    expect(alert).toHaveTextContent('Choose a stronger password: at least 8 characters, not a commonly used password.');
    expect(alert).not.toHaveTextContent(/provider text/);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('shows a retryable error when the signup request rejects', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Simulated network failure'));
    renderSignup();
    fillRequiredFields();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Network error. Please try again.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('requires terms consent before making any signup request', async () => {
    renderSignup();
    fillRequiredFields({ consentTerms: false });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('You must agree to the terms and privacy policy');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it.each([
    ['Phone (optional)', 'abc', /valid phone number/i],
    ['ZIP Code (optional)', '!@#', /valid ZIP or postal code/i],
  ])('rejects invalid optional %s before making a signup request', async (label, value, error) => {
    renderSignup();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });
});
