import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import { MemberProfileKit } from '@/components/portal/kit/pages/member/MemberProfileKit';

/**
 * WAP-193: phone, street address, state, ZIP, LinkedIn and bio were editable
 * only on /dashboard/profile?ui=legacy. The default kit profile edits them
 * and still round-trips the intake fields it doesn't show.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/dashboard/profile',
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  nav.refresh.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const passthrough = {
  phone: '512-555-0100',
  address: '100 Main St',
  state: 'TX',
  zip: '78701',
  referralSource: 'Goodwill',
  linkedin: null,
  bio: null,
  hasEmploymentBarrier: true,
  barrierTypes: ['transportation'],
  employmentStatusAtEnroll: 'unemployed',
};

describe('MemberProfileKit contact fields', () => {
  it('prefills and saves the contact fields while keeping intake fields', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberProfileKit live name="Dana Diaz" email="dana@example.org" location="Austin" accountPassthrough={passthrough} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText('Phone')).toHaveValue('512-555-0100');
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: ' 512-555-0199 ' } });
    fireEvent.change(screen.getByLabelText('LinkedIn URL'), { target: { value: 'https://linkedin.com/in/dana' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Aspiring IT tech.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/member/dashboard-profile');
    expect(JSON.parse(init.body as string)).toEqual({
      firstName: 'Dana',
      lastName: 'Diaz',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      phone: '512-555-0199',
      address: '100 Main St',
      referralSource: 'Goodwill',
      linkedin: 'https://linkedin.com/in/dana',
      bio: 'Aspiring IT tech.',
      hasEmploymentBarrier: true,
      barrierTypes: ['transportation'],
      employmentStatusAtEnroll: 'unemployed',
    });
  });

  it('sends a cleared field as null', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MemberProfileKit live name="Dana Diaz" email="dana@example.org" location="Austin" accountPassthrough={passthrough} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).address).toBeNull();
  });
});
