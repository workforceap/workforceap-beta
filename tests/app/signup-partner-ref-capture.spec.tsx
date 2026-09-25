/**
 * The `/signup` door must attribute a partner the same way `/apply` does.
 *
 * Before this suite, `?ref=` was only captured on `/apply`: a visitor who
 * landed straight on `/signup?ref=<code>` posted no `referralRef` at all and
 * was attributed to nobody. These cases render the real signup page (the
 * capture component it mounts is NOT stubbed), drive the real form, and
 * assert on the request the browser would actually send.
 *
 * Behaviour only — nothing here reads application source text (WAP-175).
 */
import type { AnchorHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

vi.hoisted(() => { vi.stubEnv('NEXT_PUBLIC_CAPTCHA_ENABLED', 'false'); });

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/signup',
  useSearchParams: () => mocks.params,
}));
// CAPTCHA is disabled for these tests; never load its third-party widget.
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/i18n/server', () => ({ getRequestLocale: async () => 'en' }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: async () => ({}) }));

import SignupPage from '@/app/(auth)/signup/page';
import { APPLY_REFERRAL_SESSION_KEY } from '@/lib/apply/applyReferralCapture';

const fetchMock = vi.fn<typeof fetch>();
const PROGRAM_INTEREST = 'Digital Literacy Empowerment Class (6 weeks, 30 hours total)';

async function renderSignupPage(query = '') {
  mocks.params = new URLSearchParams(query);
  const page = await SignupPage({ searchParams: Promise.resolve({}) });
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {page}
    </NextIntlClientProvider>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Test User' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'Password1' } });
  fireEvent.change(screen.getByLabelText('Program of Interest'), { target: { value: PROGRAM_INTEREST } });
  fireEvent.click(screen.getByRole('checkbox', { name: /terms of service/i }));
}

async function submitAndReadBody(): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [, options] = fetchMock.mock.calls[0];
  return JSON.parse(options!.body as string) as Record<string, unknown>;
}

function clearPersistedState() {
  sessionStorage.clear();
  document.cookie = 'wap_partner_ref=; Path=/; Max-Age=0';
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  clearPersistedState();
  window.dataLayer = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearPersistedState();
  delete window.dataLayer;
});

afterAll(() => { vi.unstubAllEnvs(); });

describe('/signup partner attribution (mocked transport)', () => {
  it('posts the ?ref= from the signup URL when the visitor never passed through /apply', async () => {
    await renderSignupPage('ref=Acme-HS');
    fillRequiredFields();

    expect(await submitAndReadBody()).toMatchObject({ referralRef: 'acme-hs' });
  });

  it('keeps a ref captured earlier in the funnel when /signup itself carries none', async () => {
    sessionStorage.setItem(APPLY_REFERRAL_SESSION_KEY, 'concordia-hs');

    await renderSignupPage();
    fillRequiredFields();

    expect(await submitAndReadBody()).toMatchObject({ referralRef: 'concordia-hs' });
  });

  it('posts no referralRef for an organic signup with no ref anywhere', async () => {
    await renderSignupPage();
    fillRequiredFields();

    expect(await submitAndReadBody()).not.toHaveProperty('referralRef');
  });
});
