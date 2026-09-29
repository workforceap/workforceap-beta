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
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
// The server-side disclosure lookup has its own suite; here no partner resolves
// on the server and the browser reconciles through the (mocked) API.
vi.mock('@/lib/apply/partnerReferralDisclosure', () => ({ resolvePartnerReferralDisclosure: async () => null }));
vi.mock('@/lib/apply/partnerDisclosureCopy', async () => {
  const { apply } = (await import('@/messages/en.json')).default;
  return {
    getPartnerDisclosureCopy: async () => ({
      label: apply.partnerDisclosureLabel,
      restricted: apply.partnerDisclosureRestricted,
      full: apply.partnerDisclosureFull,
    }),
  };
});

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

const signupCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/member/signup'));

async function submitAndReadBody(): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(signupCalls()).toHaveLength(1));
  const [, options] = signupCalls()[0];
  return JSON.parse(options!.body as string) as Record<string, unknown>;
}

/** Server answer for GET /api/apply/partner-disclosure. */
let disclosureAnswer: unknown = null;

function clearPersistedState() {
  sessionStorage.clear();
  document.cookie = 'wap_partner_ref=; Path=/; Max-Age=0';
}

beforeEach(() => {
  fetchMock.mockReset();
  disclosureAnswer = null;
  fetchMock.mockImplementation(async (url) => new Response(
    JSON.stringify(String(url).includes('/api/apply/partner-disclosure') ? { disclosure: disclosureAnswer } : { success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
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

    const body = await submitAndReadBody();
    expect(body).not.toHaveProperty('referralRef');
    expect(body).not.toHaveProperty('partnerDisclosureRef');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('partner-disclosure'))).toBe(false);
  });

  it('names the server-resolved partner and records which ref was disclosed', async () => {
    disclosureAnswer = { ref: 'acme-hs', partnerName: 'Acme Workforce Center', tier: 'restricted' };
    await renderSignupPage('ref=Acme-HS');

    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('You were referred by Acme Workforce Center.');
    expect(note).toHaveTextContent('will not see your email');
    const lookup = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/apply/partner-disclosure'));
    expect(String(lookup?.[0])).toContain('ref=acme-hs');

    fillRequiredFields();
    expect(await submitAndReadBody()).toMatchObject({ referralRef: 'acme-hs', partnerDisclosureRef: 'acme-hs' });
  });

  it('shows no disclosure when the server does not resolve the ref (unknown or inactive partner)', async () => {
    disclosureAnswer = null;
    await renderSignupPage('ref=unknown-partner');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('partner-disclosure'))).toBe(true));

    expect(screen.queryByText(/You were referred by/)).toBeNull();
    fillRequiredFields();
    const body = await submitAndReadBody();
    expect(body).toMatchObject({ referralRef: 'unknown-partner' });
    expect(body).not.toHaveProperty('partnerDisclosureRef');
  });
});
