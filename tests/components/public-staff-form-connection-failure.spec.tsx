/**
 * Public and staff forms must never show the browser's internal error text
 * ("Failed to fetch", "Unexpected token '<'") when a connection drops or the
 * platform answers with an HTML error page. They read one plain translated
 * sentence instead; messages the server sent on purpose still pass through.
 * Sibling of tests/components/member-form-connection-failure.spec.tsx.
 */
import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import InvitePage from '@/app/invite/page';
import CounselorProfileForm from '@/app/(portal)/counselor/profile/CounselorProfileForm';
import EmployerLoiForm from '@/components/employer/EmployerLoiForm';
import BillingPacketList from '@/components/billing/BillingPacketList';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

const CONNECTION_COPY = messages.common.connectionError;
const RAW_BROWSER_TEXT = /Failed to fetch|Unexpected token|not valid JSON/;

const fetchMock = vi.fn<typeof fetch>();
let consoleError: ReturnType<typeof vi.spyOn>;

/** What Chromium rejects with when the network drops during `fetch()`. */
const droppedConnection = () => new TypeError('Failed to fetch');
/** A proxy/platform HTML 500: `res.json()` rejects with the browser's SyntaxError. */
const htmlErrorPage = () =>
  new Response('<!doctype html><html><body><h1>500 Internal Server Error</h1></body></html>', {
    status: 500,
    headers: { 'content-type': 'text/html' },
  });
const serverMessage = (error: string, status = 409) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

function withMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="America/New_York">
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setValue(container: HTMLElement, selector: string, value: string) {
  const field = container.querySelector(selector);
  if (!field) throw new Error(`missing field ${selector}`);
  fireEvent.change(field, { target: { value } });
}

describe('public invitation login-code form', () => {
  async function fillAndSubmit(container: HTMLElement) {
    // No ?token in the URL, so the page shows the email + login-code form.
    await waitFor(() => expect(container.querySelector('#code-email')).not.toBeNull());
    setValue(container, '#code-email', 'invited-person@example.org');
    setValue(container, '#code-value', 'ABCD-1234');
    fireEvent.submit(container.querySelector('form')!);
  }

  it('shows the translated connection message, not "Failed to fetch", when the connection drops', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    const { container } = withMessages(<InvitePage />);
    await fillAndSubmit(container);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('invite-code'), expect.any(TypeError));
  });

  it('localizes a recognized message the server sent on purpose', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ valid: false, error: 'Invitation has expired' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const { container } = withMessages(<InvitePage />);
    await fillAndSubmit(container);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.auth.invite.errors.expired);
    expect(alert.textContent).not.toContain(CONNECTION_COPY);
  });
});

describe('counselor profile form', () => {
  const initial = { fullName: 'Taylor Staff', phone: '', title: '' };

  it('maps a dropped connection to the translated connection message', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    const { container } = withMessages(<CounselorProfileForm initial={initial} isNew={false} />);
    fireEvent.submit(container.querySelector('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONNECTION_COPY);
    expect(alert.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('counselor-profile'), expect.any(TypeError));
  });

  it('localizes a recognized message the server sent on purpose', async () => {
    fetchMock.mockResolvedValue(serverMessage('Phone number must include an area code.', 400));
    const { container } = withMessages(<CounselorProfileForm initial={initial} isNew={false} />);
    fireEvent.submit(container.querySelector('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Phone number must include an area code.');
  });
});

describe('employer letter of intent form', () => {
  it('maps an HTML 500 page to the translated connection message instead of "Unexpected token"', async () => {
    fetchMock.mockResolvedValue(htmlErrorPage());
    const { container } = withMessages(<EmployerLoiForm />);
    fireEvent.submit(container.querySelector('form')!);
    const notice = await screen.findByText(CONNECTION_COPY);
    expect(notice).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('employer-loi'), expect.any(SyntaxError));
  });

  it('maps a dropped connection to the translated connection message', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    const { container } = withMessages(<EmployerLoiForm />);
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByText(CONNECTION_COPY)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(RAW_BROWSER_TEXT);
  });
});

describe('billing packet send', () => {
  const packet: BillingPacketSummary = {
    id: 'packet-1', packetNumber: 'J5-0001', status: 'signed', programSlug: 'fixture-program', programTitle: 'Fixture program',
    invoiceDate: '2026-09-01T00:00:00.000Z', dueDate: null, billToName: 'Fixture Agency', referenceNumber: null, totalAmount: 1250,
    lineItems: [], signerName: 'Sam Signer', signerTitle: 'Director', signedAt: '2026-09-01T00:00:00.000Z', sentAt: null, sentTo: [], sendCount: 0, recipients: null,
  };

  it('maps a dropped connection to the translated connection message', async () => {
    fetchMock.mockRejectedValue(droppedConnection());
    withMessages(<BillingPacketList packets={[packet]} canSend memberEmail="student@example.org" />);
    fireEvent.click(screen.getByRole('button', { name: 'Email to counselor and student' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(CONNECTION_COPY);
    expect(status.textContent).not.toMatch(RAW_BROWSER_TEXT);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('billing-packet-send'), expect.any(TypeError));
  });
});
