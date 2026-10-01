import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

const navigation = vi.hoisted(() => ({ pathname: '/en/login', search: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useSearchParams: () => navigation.search }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, fill: _fill, priority: _priority, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => <img alt={alt} {...props} />,
}));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn(), trackMemberLoggedIn: vi.fn() }));

import LoginForm from '@/app/(auth)/login/LoginForm';
import InvitePage from '@/app/invite/page';

const catalogs = { en, es, fr, pt };
type Locale = keyof typeof catalogs;
const fetchMock = vi.fn<typeof fetch>();
const token = 'fixture-invitation-token-for-local-tests-only';
const invitation = { valid: true, email: 'fixture@example.test', role: 'counselor', roleLabel: 'Counselor', inviterName: 'Fixture Reviewer', counselorAffiliation: 'community_ambassador' };
function mount(locale: Locale, ui: ReactNode, path = 'invite') {
  navigation.pathname = `/${locale}/${path}`;
  return render(<NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="America/New_York">{ui}</NextIntlClientProvider>);
}

beforeEach(() => {
  fetchMock.mockReset();
  navigation.search = new URLSearchParams();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each(['en', 'es', 'fr', 'pt'] as const)('%s localized auth copy', (locale) => {
  const messages = catalogs[locale];
  it.each(['admin', 'counselor', 'partner', 'employer', 'member'] as const)('shows %s audience copy while retaining the exact destination', (audience) => {
    const root = audience === 'member' ? 'dashboard' : audience;
    const target = `/${locale}/${root}/details?tab=training#saved`;
    mount(locale, <LoginForm initialRedirectTo={target} />, 'login');
    const copy = messages.auth.login.destinations[audience];
    expect(screen.getByText(copy.headline)).toBeInTheDocument();
    expect(screen.getByText(copy.subtitle)).toBeInTheDocument();
    expect(screen.getByText(copy.title)).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(messages.auth.login.heading);
    const nav = within(screen.getByRole('navigation', { name: messages.auth.login.portalDestinationAria }));
    expect(nav.getByRole('link', { name: copy.label })).toHaveAttribute('href', `/${locale}/login?redirectTo=${encodeURIComponent(target)}`);
    expect(nav.getByRole('link', { name: copy.label })).toHaveAttribute('aria-current', 'true');
    expect(nav.getByRole('link', { name: copy.label })).toHaveAttribute('title', copy.description);
    if (locale !== 'en') expect(screen.queryByText(en.auth.login.destinations[audience].headline)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('localizes the code-required form and sign-in link without issuing a request', () => {
    mount(locale, <InvitePage />);
    expect(screen.getByRole('heading', { name: messages.auth.invite.codeHeading })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.auth.invite.email)).toBeRequired();
    expect(screen.getByLabelText(messages.auth.invite.loginCode)).toHaveAttribute('autoComplete', 'one-time-code');
    expect(screen.getByRole('link')).toHaveAttribute('href', `/${locale}/login`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Invitation has expired', 'expired'],
    ['Invalid or missing token', 'invalidLink'],
    ['Already accepted', 'alreadyAccepted'],
    ['Database detail that must stay private', 'loadFailed'],
  ] as const)('localizes the invalid invitation response %s', async (error, key) => {
    navigation.search.set('token', token);
    fetchMock.mockResolvedValueOnce(Response.json({ valid: false, error }, { status: 400 }));
    mount(locale, <InvitePage />);
    expect(screen.getByRole('status')).toHaveTextContent(messages.auth.invite.loading);
    expect(await screen.findByRole('heading', { name: messages.auth.invite.invalidHeading })).toBeInTheDocument();
    expect(screen.getByText(messages.auth.invite.errors[key])).toBeInTheDocument();
    expect(screen.queryByText(error, { exact: true })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/invite/validate?token=${token}`);
  });

  it('localizes role, affiliation and form labels while preserving recipient and password semantics', async () => {
    navigation.search.set('token', token);
    fetchMock.mockResolvedValueOnce(Response.json(invitation));
    mount(locale, <InvitePage />);
    expect(await screen.findByRole('heading', { name: messages.auth.invite.invitedHeading })).toBeInTheDocument();
    expect(screen.getByText(messages.auth.invite.roles.counselor, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(messages.auth.invite.communityAmbassador)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.auth.invite.email)).toHaveValue(invitation.email);
    expect(screen.getByLabelText(messages.auth.invite.email)).toHaveAttribute('readOnly');
    expect(screen.getByLabelText(messages.auth.invite.password)).toHaveAttribute('minLength', '8');
    expect(screen.getByLabelText(messages.auth.invite.password)).not.toBeRequired();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

it('submits code/email unchanged and uses translated mismatch guidance', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ valid: false, error: 'No open invitation matches that email and login code. Check both, or ask your WorkforceAP contact to resend it.' }, { status: 404 }));
  mount('es', <InvitePage />);
  fireEvent.change(screen.getByLabelText(es.auth.invite.email), { target: { value: 'fixture@example.test' } });
  fireEvent.change(screen.getByLabelText(es.auth.invite.loginCode), { target: { value: 'abcd-1234' } });
  fireEvent.click(screen.getByRole('button', { name: es.auth.invite.continue }));
  expect(await screen.findByRole('alert')).toHaveTextContent(es.auth.invite.errors.codeMismatch);
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/invite/validate?code=ABCD-1234&email=fixture%40example.test');
  expect(screen.getByRole('button', { name: es.auth.invite.continue })).toBeEnabled();
});

it('keeps the acceptance payload and maps a known curriculum pause without exposing raw errors', async () => {
  navigation.search.set('token', token);
  fetchMock.mockResolvedValueOnce(Response.json(invitation));
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'English provider detail', code: 'CURRICULUM_MIGRATION_PENDING' }, { status: 409 }));
  mount('es', <InvitePage />);
  await screen.findByRole('heading', { name: es.auth.invite.invitedHeading });
  fireEvent.change(screen.getByLabelText(es.auth.invite.fullName), { target: { value: 'Fixture Person' } });
  fireEvent.click(screen.getByRole('button', { name: es.auth.invite.accept }));
  expect(await screen.findByRole('alert')).toHaveTextContent(es.auth.invite.errors.curriculumPending);
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/invite/accept');
  expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({ token, fullName: 'Fixture Person' });
  expect(screen.queryByText('English provider detail')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: es.auth.invite.accept })).toBeEnabled();
});

it('uses localized generic retry guidance for an unknown acceptance error', async () => {
  navigation.search.set('token', token);
  fetchMock.mockResolvedValueOnce(Response.json(invitation));
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'private provider stack' }, { status: 500 }));
  mount('es', <InvitePage />);
  await screen.findByRole('heading', { name: es.auth.invite.invitedHeading });
  fireEvent.change(screen.getByLabelText(es.auth.invite.fullName), { target: { value: 'Fixture Person' } });
  fireEvent.click(screen.getByRole('button', { name: es.auth.invite.accept }));
  expect(await screen.findByRole('alert')).toHaveTextContent(es.auth.invite.errors.acceptFailed);
  expect(screen.queryByText('private provider stack')).not.toBeInTheDocument();
});

it.each([
  ['INVITE_ACCOUNT_RECOVERY_REQUIRED', 'accountRecoveryRequired'],
  ['INVITE_IDENTITY_REVIEW_REQUIRED', 'identityReviewRequired'],
] as const)('shows localized invitation guidance for %s', async (code, errorKey) => {
  navigation.search.set('token', token);
  fetchMock.mockResolvedValueOnce(Response.json(invitation));
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'Private provider detail', code }, { status: 409 }));
  mount('es', <InvitePage />);
  await screen.findByRole('heading', { name: es.auth.invite.invitedHeading });
  fireEvent.change(screen.getByLabelText(es.auth.invite.fullName), { target: { value: 'Fixture Person' } });
  fireEvent.click(screen.getByRole('button', { name: es.auth.invite.accept }));
  expect(await screen.findByRole('alert')).toHaveTextContent(es.auth.invite.errors[errorKey]);
  expect(screen.queryByText('Private provider detail')).not.toBeInTheDocument();
});

it('retains the safe default when a login destination is protocol-relative', () => {
  mount('es', <LoginForm initialRedirectTo="//example.test/unsafe" />, 'login');
  const nav = within(screen.getByRole('navigation', { name: es.auth.login.portalDestinationAria }));
  expect(nav.getByRole('link', { name: es.auth.login.destinations.member.label })).toHaveAttribute('href', '/es/login?redirectTo=%2Fdashboard');
});

it('does not accept an invitation when its validation HTTP response failed', async () => {
  navigation.search.set('token', token);
  fetchMock.mockResolvedValueOnce(Response.json({ ...invitation, error: 'Server failure' }, { status: 500 }));
  mount('es', <InvitePage />);
  await waitFor(() => expect(screen.getByRole('heading', { name: es.auth.invite.invalidHeading })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: es.auth.invite.accept })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([
  ['/login?redirectTo=/counselor/profile', '/es/login?redirectTo=/counselor/profile'],
  ['//outside.example/unsafe', '/es/login?redirectTo=/dashboard'],
])('shows a localized success link for the safe acceptance destination %s', async (redirectTo, expected) => {
  navigation.search.set('token', token);
  fetchMock.mockResolvedValueOnce(Response.json(invitation));
  fetchMock.mockResolvedValueOnce(Response.json({ ok: true, redirectTo }));
  mount('es', <InvitePage />);
  await screen.findByRole('heading', { name: es.auth.invite.invitedHeading });
  fireEvent.change(screen.getByLabelText(es.auth.invite.fullName), { target: { value: 'Fixture Person' } });
  fireEvent.click(screen.getByRole('button', { name: es.auth.invite.accept }));
  expect(await screen.findByRole('heading', { name: es.auth.invite.acceptedHeading })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: es.auth.invite.signIn })).toHaveAttribute('href', expected);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
