import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

vi.mock('@/components/LocalizedLink', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import ApplyStatusClient from '@/app/apply/status/ApplyStatusClient';

/**
 * Review 2026-09-22: /api/apply/status-lookup never looks an application up
 * (anti-enumeration) and nothing in the codebase sends SMS, yet the page
 * promised "We will show your current status" and "updates by email and SMS".
 * The page now says what happens and renders the not-found state explicitly.
 */
const catalogs = { en, es };
const fetchMock = vi.fn<typeof fetch>();

function mount(locale: keyof typeof catalogs) {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="America/New_York">
      <ApplyStatusClient />
    </NextIntlClientProvider>,
  );
}

async function submit(email: string) {
  fireEvent.change(screen.getByLabelText(catalogs.en.apply.statusEmailLabel, { exact: false }), { target: { value: email } });
  fireEvent.click(screen.getByRole('button'));
  return screen.findByRole('status');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('application status page copy', () => {
  it('does not promise a status lookup or SMS updates before the form is used', () => {
    mount('en');
    const lead = screen.getByText(/no password required/i);
    expect(lead).not.toHaveTextContent(/show your current status/i);
    expect(lead).toHaveTextContent(/not available yet/i);
    expect(document.body).not.toHaveTextContent(/SMS/);
  });

  it('renders found:false as an explicit not-found message with a contact path, not the API text', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ found: false, message: 'you will receive status updates by email and SMS' }),
    );
    mount('en');
    const status = await submit('applicant@example.test');
    expect(status).toHaveTextContent('No application status is available for applicant@example.test on this page.');
    expect(status).toHaveTextContent(/arrives there by email once our team has reviewed your application/);
    expect(status).toHaveTextContent(/We do not send text-message status updates/);
    expect(status).not.toHaveTextContent(/updates by email and SMS/);
    expect(screen.getByRole('link', { name: 'contact the team' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: en.apply.statusLoginCta })).toHaveAttribute('href', '/login?redirectTo=/dashboard');
  });

  it('localizes the not-found state', async () => {
    fetchMock.mockResolvedValue(Response.json({ found: false, message: 'generic' }));
    mount('es');
    fireEvent.change(screen.getByLabelText(es.apply.statusEmailLabel, { exact: false }), { target: { value: 'solicitante@example.test' } });
    fireEvent.click(screen.getByRole('button'));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('No hay estado de solicitud disponible para solicitante@example.test en esta página.');
    expect(status).not.toHaveTextContent('generic');
    expect(screen.getByRole('link', { name: es.apply.statusNotFoundContactLink })).toHaveAttribute('href', '/contact');
  });

  it('still surfaces API errors as alerts', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 }));
    mount('en');
    fireEvent.change(screen.getByLabelText(en.apply.statusEmailLabel, { exact: false }), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
