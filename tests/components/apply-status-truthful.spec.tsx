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
 * Review 2026-09-22 (#2471) removed a false SMS promise here. Product call
 * 28a then made the lookup real: the page now asks for the email and says a
 * link was sent IF an application exists, in the same words for every
 * address. The copy must stay truthful: email only, no reply-time promise.
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

async function submit(locale: keyof typeof catalogs, email: string) {
  fireEvent.change(screen.getByLabelText(catalogs[locale].apply.statusEmailLabel, { exact: false }), { target: { value: email } });
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
  it('explains the emailed link honestly before the form is used', () => {
    mount('en');
    const lead = screen.getByText(/no password required/i);
    expect(lead).toHaveTextContent(/If we have an application under that address, we will email you a link/);
    expect(lead).toHaveTextContent(/expire after 30 minutes/);
    expect(lead).not.toHaveTextContent(/not available yet/i);
    expect(document.body).not.toHaveTextContent(/SMS/);
    expect(document.body).not.toHaveTextContent(/business day/i);
    expect(screen.getByRole('button')).toHaveTextContent(en.apply.statusSubmit);
  });

  it('posts the trimmed email and renders the generic sent state from the API contract', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'ignored by the client', expiresInMinutes: 30 }));
    mount('en');
    const status = await submit('en', '  applicant@example.test ');
    expect(fetchMock).toHaveBeenCalledWith('/api/apply/status-lookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'applicant@example.test' }),
    }));
    expect(status).toHaveTextContent('Check your inbox.');
    expect(status).toHaveTextContent("If we have an application under applicant@example.test, we've emailed you a link. It expires in 30 minutes.");
    expect(status).toHaveTextContent(/We send status updates by email only, never by text message/);
    expect(status).not.toHaveTextContent('ignored by the client');
    expect(screen.getByRole('link', { name: 'contact the team' })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: en.apply.statusLoginCta })).toHaveAttribute('href', '/login?redirectTo=/dashboard');
  });

  it('renders the same sent state whatever the API knows, so the page cannot enumerate', async () => {
    const texts: string[] = [];
    for (const email of ['known@example.test', 'unknown@example.test']) {
      fetchMock.mockResolvedValue(Response.json({ ok: true, message: 'x', expiresInMinutes: 30 }));
      const view = mount('en');
      const status = await submit('en', email);
      texts.push(status.textContent!.replace(email, '<email>'));
      view.unmount();
    }
    expect(texts[0]).toBe(texts[1]);
  });

  it('localizes the sent state', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true, expiresInMinutes: 30 }));
    mount('es');
    const status = await submit('es', 'solicitante@example.test');
    expect(status).toHaveTextContent('Si tenemos una solicitud con solicitante@example.test, te enviamos un enlace por correo. Expira en 30 minutos.');
    expect(screen.getByRole('link', { name: es.apply.statusContactLink })).toHaveAttribute('href', '/contact');
  });

  it('still surfaces API errors as alerts', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 }));
    mount('en');
    fireEvent.change(screen.getByLabelText(en.apply.statusEmailLabel, { exact: false }), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('treats an unexpected 200 body as an error rather than claiming a link was sent', async () => {
    fetchMock.mockResolvedValue(Response.json({ found: false, message: 'legacy shape' }));
    mount('en');
    fireEvent.change(screen.getByLabelText(en.apply.statusEmailLabel, { exact: false }), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.apply.statusErrorUnexpected);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
